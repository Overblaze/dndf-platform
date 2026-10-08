// Where characters are kept: the signed-in player's rows in Supabase, or this
// browser's storage when nobody is signed in (a try-it-out mode).
import { normalizeDoc, sameDoc, type CharacterDoc } from '@dndf/engine';
import { LOCAL_HISTORY_CAP, pushHistory, withinHistory, type HistoryEntry } from './history';
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
  /**
   * Writes the character, unless it has been changed somewhere else (the Discord bot, another tab
   * or device) since this page last read or wrote it: then it throws ChangedElsewhere and writes
   * nothing. `force` writes regardless, for when the player has chosen to keep this page's version.
   */
  save(id: string, doc: CharacterDoc, options?: { force?: boolean }): Promise<void>;
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

/** The character was changed elsewhere since this page last read it. Carries the version that is saved now. */
export class ChangedElsewhere extends Error {
  constructor(readonly current: StoredCharacter) {
    super('This character was changed somewhere else');
    this.name = 'ChangedElsewhere';
  }
}

/** What this page last read or wrote for each character: the moment it was saved, and what it held. */
const known = new Map<string, { updatedAt: string; doc: unknown }>();
const remember = (stored: StoredCharacter, doc: unknown = stored.doc) => known.set(stored.id, { updatedAt: stored.updatedAt, doc });

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

/** Brings this tab's copy of the list up to date with what is stored. */
function syncLocal() {
  if (!storageWorks()) return; // nothing is stored: this tab's copy is all there is
  const stored = readLocal();
  for (const id of Object.keys(memory)) if (!(id in stored)) delete memory[id];
  Object.assign(memory, stored);
}

/** A time that is never the same twice in one tab, so two saves in one millisecond still differ. */
let lastStamp = '';
function stamp(): string {
  let now = new Date().toISOString();
  if (now <= lastStamp) now = new Date(new Date(lastStamp).getTime() + 1).toISOString();
  return (lastStamp = now);
}

const LOCAL_HISTORY_KEY = 'dndf.history.';
const localHistory = new Map<string, HistoryEntry[]>();
function readHistory(id: string): HistoryEntry[] {
  const known = localHistory.get(id);
  if (known) return known;
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY + id) ?? '[]') as HistoryEntry[];
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.at === 'string' && withinHistory(entry)) : [];
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
    // Another tab may have written since this one loaded: read what is stored now.
    syncLocal();
    const stored = memory[id] ?? null;
    if (stored) remember(stored);
    return stored;
  },
  async create(doc) {
    syncLocal();
    const stored = { id: `local-${crypto.randomUUID()}`, doc, updatedAt: stamp() };
    memory[stored.id] = stored;
    writeLocal(memory);
    remember(stored);
    return stored;
  },
  async save(id, doc, options) {
    // Every tab holds its own copy of the list. Writing that copy whole would undo what another tab
    // did to other characters, so the stored list is read first and only this character is changed.
    syncLocal();
    const current = memory[id];
    const mine = known.get(id);
    if (!options?.force && current && mine && current.updatedAt !== mine.updatedAt && !sameDoc(current.doc, mine.doc)) throw new ChangedElsewhere(current);
    const stored = { id, doc, updatedAt: stamp() };
    memory[id] = stored;
    writeLocal(memory);
    remember(stored);
  },
  async remove(id) {
    syncLocal();
    delete memory[id];
    known.delete(id);
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
  const queue = new Map<string, Promise<void>>();
  const change = (doc: CharacterDoc) => ({ rules_version: doc.rulesVersion, doc });

  async function write(id: string, doc: CharacterDoc, force: boolean): Promise<void> {
    const mine = known.get(id);
    if (!force && mine) {
      // Only if the row is still as this page last saw it.
      const { data, error } = await db.from('characters').update(change(doc)).eq('id', id).eq('updated_at', mine.updatedAt).select('updated_at');
      if (error) throw fail('save', error.message);
      const row = (data as { updated_at: string }[] | null)?.[0];
      if (row) {
        known.set(id, { updatedAt: row.updated_at, doc });
        return;
      }
      // Nothing was written. Either someone else changed the character, or it is gone.
      const { data: now, error: failed } = await db.from('characters').select('id, doc, updated_at').eq('id', id).maybeSingle();
      if (failed) throw fail('save', failed.message);
      if (!now) throw new Error('This character no longer exists on your account, so it could not be saved');
      const current = fromRow(now as Row);
      // Changed in time but not in content (or the two times were merely written differently): safe to write.
      if (current && !sameDoc((now as Row).doc, mine.doc)) throw new ChangedElsewhere(current);
    }
    const { data, error } = await db.from('characters').update(change(doc)).eq('id', id).select('updated_at');
    if (error) throw fail('save', error.message);
    const row = (data as { updated_at: string }[] | null)?.[0];
    if (!row) throw new Error('This character no longer exists on your account, so it could not be saved');
    known.set(id, { updatedAt: row.updated_at, doc });
  }

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
      const stored = data ? fromRow(data as Row) : null;
      // Remember the document as the database holds it, before it is put into shape for the app.
      if (stored) remember(stored, (data as Row).doc);
      return stored;
    },
    async create(doc) {
      const { data, error } = await db.from('characters').insert({ rules_version: doc.rulesVersion, doc }).select('id, doc, updated_at').single();
      if (error) throw fail('create the character', error.message);
      const stored = fromRow(data as Row)!;
      remember(stored, (data as Row).doc);
      return stored;
    },
    save(id, doc, options) {
      // One at a time for each character: a save started while another is under way would compare
      // against a time that is about to change, and see its own earlier save as someone else's.
      const run = (queue.get(id) ?? Promise.resolve()).catch(() => {}).then(() => write(id, doc, Boolean(options?.force)));
      queue.set(id, run);
      return run;
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
