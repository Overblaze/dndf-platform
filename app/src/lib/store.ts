// Where characters are kept: the signed-in player's rows in Supabase, or this
// browser's storage when nobody is signed in (a try-it-out mode).
import { normalizeDoc, type CharacterDoc } from '@dndf/engine';
import { LOCAL_HISTORY_CAP, pushHistory, type HistoryEntry } from './history';
import { blobToDataUrl } from './image';
import { supabase } from './supabase';

export interface StoredCharacter {
  id: string;
  doc: CharacterDoc;
  updatedAt: string;
}

export interface CharacterStore {
  /** true when characters only live in this browser. */
  local: boolean;
  list(): Promise<StoredCharacter[]>;
  get(id: string): Promise<StoredCharacter | null>;
  create(doc: CharacterDoc): Promise<StoredCharacter>;
  save(id: string, doc: CharacterDoc): Promise<void>;
  remove(id: string): Promise<void>;
  /** Adds a line to the character's history, with the character as it was before. Never fails the action it describes. */
  log(id: string, summary: string, before?: CharacterDoc): Promise<void>;
  /** The character's history, newest first. */
  history(id: string): Promise<HistoryEntry[]>;
  /** Stores a sheet background picture and returns the reference to keep in the character. */
  uploadBackground(id: string, picture: Blob): Promise<string>;
  /** A URL the browser can show for a stored picture, or null if it is gone. */
  backgroundUrl(ref: string): Promise<string | null>;
  removeBackground(ref: string): Promise<void>;
}

const LOCAL_KEY = 'dndf.characters.v1';

function readLocal(): Record<string, StoredCharacter> {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, { id?: unknown; doc?: unknown; updatedAt?: unknown }>;
    const out: Record<string, StoredCharacter> = {};
    for (const [id, stored] of Object.entries(raw ?? {})) {
      // Older saves and damaged ones are put into shape here; one that is not a character at all is left out.
      const doc = normalizeDoc(stored?.doc);
      if (doc) out[id] = { id, doc, updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : new Date(0).toISOString() };
    }
    return out;
  } catch {
    return {};
  }
}

/** Whether this browser lets pages keep anything at all (a private window may not). */
function storageWorks(): boolean {
  try {
    localStorage.setItem('dndf.probe', '1');
    localStorage.removeItem('dndf.probe');
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes every character to this browser. If the browser's store is full, the undo history kept
 * here is given up first (characters matter more than their history) and the write is tried again.
 * Throws when the characters still do not fit, so the sheet can say "Not saved" instead of losing
 * work silently. A browser that refuses storage altogether keeps characters until the tab closes.
 */
function writeLocal(all: Record<string, StoredCharacter>) {
  const text = JSON.stringify(all);
  try {
    localStorage.setItem(LOCAL_KEY, text);
    return;
  } catch {
    if (!storageWorks()) return;
  }
  dropLocalHistory();
  try {
    localStorage.setItem(LOCAL_KEY, text);
  } catch {
    throw new Error('This browser has no room left to save characters. Sign in to keep them on your account, or delete a character or a sheet picture you no longer need');
  }
}

function dropLocalHistory() {
  localHistory.clear();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(LOCAL_HISTORY_KEY)) localStorage.removeItem(key);
  } catch {
    // Nothing to give up.
  }
}

const memory: Record<string, StoredCharacter> = readLocal();

const LOCAL_HISTORY_KEY = 'dndf.history.';
const localHistory = new Map<string, HistoryEntry[]>();
function readHistory(id: string): HistoryEntry[] {
  const known = localHistory.get(id);
  if (known) return known;
  try {
    return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY + id) ?? '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

const LOCAL_PICTURE_KEY = 'dndf.background.';
const localPictures = new Map<string, string>();

const localStore: CharacterStore = {
  local: true,
  async list() {
    return Object.values(memory).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    return memory[id] ?? null;
  },
  async create(doc) {
    const stored = { id: `local-${crypto.randomUUID()}`, doc, updatedAt: new Date().toISOString() };
    memory[stored.id] = stored;
    writeLocal(memory);
    return stored;
  },
  async save(id, doc) {
    memory[id] = { id, doc, updatedAt: new Date().toISOString() };
    writeLocal(memory);
  },
  async remove(id) {
    delete memory[id];
    writeLocal(memory);
    localHistory.delete(id);
    try { localStorage.removeItem(LOCAL_HISTORY_KEY + id); } catch { /* nothing stored */ }
    await this.removeBackground(`local:${id}`);
  },
  async log(id, summary, before) {
    const list = pushHistory(readHistory(id), { id: crypto.randomUUID(), summary, at: new Date().toISOString(), before }, LOCAL_HISTORY_CAP);
    localHistory.set(id, list);
    // When the store is nearly full, keep fewer lines rather than none.
    for (let keep = list.length; keep >= 1; keep = Math.floor(keep / 2)) {
      try {
        localStorage.setItem(LOCAL_HISTORY_KEY + id, JSON.stringify(list.slice(0, keep)));
        break;
      } catch {
        if (keep === 1) break; // no room for even one line: the history lasts until the tab closes
      }
    }
  },
  async history(id) {
    return readHistory(id);
  },
  async uploadBackground(id, picture) {
    const ref = `local:${id}`;
    const dataUrl = await blobToDataUrl(picture);
    localPictures.set(ref, dataUrl);
    try {
      localStorage.setItem(LOCAL_PICTURE_KEY + ref, dataUrl);
    } catch {
      // Browser storage is small. The picture still shows until the tab closes.
      throw new Error('This browser has no room to keep the picture, so it will be gone after you close the tab. Sign in to keep pictures on your account.');
    }
    return ref;
  },
  async backgroundUrl(ref) {
    try {
      return localPictures.get(ref) ?? localStorage.getItem(LOCAL_PICTURE_KEY + ref);
    } catch {
      return localPictures.get(ref) ?? null;
    }
  },
  async removeBackground(ref) {
    localPictures.delete(ref);
    try {
      localStorage.removeItem(LOCAL_PICTURE_KEY + ref);
    } catch {
      // Nothing was stored.
    }
  },
};

interface Row {
  id: string;
  doc: unknown;
  updated_at: string;
}

function fromRow(row: Row): StoredCharacter | null {
  const doc = normalizeDoc(row.doc);
  return doc ? { id: row.id, doc, updatedAt: row.updated_at } : null;
}

const BUCKET = 'sheet-backgrounds';
/** Downloaded pictures, by reference, so switching tabs doesn't fetch them again. */
const pictureUrls = new Map<string, string>();

function remoteStore(userId: string): CharacterStore {
  const db = supabase!;
  const pictures = db.storage.from(BUCKET);
  const fail = (what: string, message: string) => new Error(`Could not ${what}: ${message}`);
  return {
    local: false,
    async list() {
      const { data, error } = await db.from('characters').select('id, doc, updated_at').eq('owner_id', userId).order('updated_at', { ascending: false });
      if (error) throw fail('load your characters', error.message);
      return (data as Row[]).flatMap((row) => fromRow(row) ?? []);
    },
    async get(id) {
      const { data, error } = await db.from('characters').select('id, doc, updated_at').eq('id', id).maybeSingle();
      if (error) throw fail('load this character', error.message);
      return data ? fromRow(data as Row) : null;
    },
    async create(doc) {
      const { data, error } = await db.from('characters').insert({ rules_version: doc.rulesVersion, doc }).select('id, doc, updated_at').single();
      if (error) throw fail('create the character', error.message);
      return fromRow(data as Row)!;
    },
    async save(id, doc) {
      const { error } = await db.from('characters').update({ rules_version: doc.rulesVersion, doc }).eq('id', id);
      if (error) throw fail('save', error.message);
    },
    async remove(id) {
      const { error } = await db.from('characters').delete().eq('id', id);
      if (error) throw fail('delete the character', error.message);
      // Tidy up its pictures; leftovers are harmless, so problems here are ignored.
      const folder = `${userId}/${id}`;
      const { data } = await pictures.list(folder);
      if (data?.length) await pictures.remove(data.map((file) => `${folder}/${file.name}`));
    },
    async log(id, summary, before) {
      await db.from('character_history').insert({ character_id: id, change: before ? { summary, before } : { summary } });
    },
    async history(id) {
      const { data, error } = await db.from('character_history').select('id, change, at').eq('character_id', id).order('at', { ascending: false }).limit(100);
      if (error) throw fail('load the history', error.message);
      return (data as { id: number; change: { summary?: string; before?: unknown }; at: string }[]).map((row) => ({
        id: String(row.id), summary: row.change.summary ?? 'A change', at: row.at, before: normalizeDoc(row.change.before) ?? undefined,
      }));
    },
    async uploadBackground(id, picture) {
      const ref = `${userId}/${id}/${crypto.randomUUID()}.jpg`;
      const { error } = await pictures.upload(ref, picture, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) {
        const setup = /bucket not found/i.test(error.message) ? ' The picture store has not been set up yet (migration 0002).' : '';
        throw fail('upload the picture', `${error.message}.${setup}`);
      }
      pictureUrls.set(ref, URL.createObjectURL(picture));
      return ref;
    },
    async backgroundUrl(ref) {
      const known = pictureUrls.get(ref);
      if (known) return known;
      const { data, error } = await pictures.download(ref);
      if (error || !data) return null;
      const url = URL.createObjectURL(data);
      pictureUrls.set(ref, url);
      return url;
    },
    async removeBackground(ref) {
      pictureUrls.delete(ref);
      if (ref.startsWith(`${userId}/`)) await pictures.remove([ref]);
    },
  };
}

export function storeFor(userId: string | null): CharacterStore {
  return userId && supabase ? remoteStore(userId) : localStore;
}
