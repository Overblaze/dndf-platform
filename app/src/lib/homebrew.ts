// A player's own spells. Signed in, they live in the homebrew table and can be shared with a campaign;
// signed out, they are kept in this browser. Either way a spell learned by a character is copied onto
// the character, so the library is only a place to pick from.
import { cleanCustomSpell, type CustomSpell } from '@dndf/engine';
import { supabase } from './supabase';

export interface LibrarySpell extends CustomSpell {
  /** Whether this account wrote it (and so may change it). */
  mine: boolean;
  /** The campaign it is shared with, when it is. */
  campaignId: string | null;
}

export interface SpellLibrary {
  /** true when spells only live in this browser. */
  local: boolean;
  list(): Promise<LibrarySpell[]>;
  /** Adds the spell, or changes it when one with its id exists. */
  save(spell: CustomSpell, campaignId: string | null): Promise<void>;
  remove(id: string): Promise<void>;
}

const LOCAL_KEY = 'dndf.spells.v1';
const byLevel = (a: CustomSpell, b: CustomSpell) => a.level - b.level || a.name.localeCompare(b.name);

function readLocal(): CustomSpell[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.flatMap((r) => cleanCustomSpell(r) ?? []) : [];
  } catch {
    return [];
  }
}

const localLibrary: SpellLibrary = {
  local: true,
  list: async () => readLocal().sort(byLevel).map((s) => ({ ...s, mine: true, campaignId: null })),
  save: async (spell) => {
    const clean = cleanCustomSpell(spell);
    if (!clean) throw new Error('A spell needs a name.');
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify([...readLocal().filter((s) => s.id !== clean.id), clean]));
    } catch {
      throw new Error('This browser’s storage is full, so the spell was not kept.');
    }
  },
  remove: async (id) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(readLocal().filter((s) => s.id !== id)));
  },
};

/** A database error in plain words. A missing table means its migration has not been run yet. */
function explain(error: { message: string; code?: string }): Error {
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)) {
    return new Error('Your spell library needs one more database table. Run supabase/migrations/0004_homebrew.sql in the Supabase SQL Editor.');
  }
  if (error.code === '42501') return new Error('The database refused: only the person who wrote a spell can change it.');
  return new Error(error.message);
}

function remoteLibrary(userId: string): SpellLibrary {
  const db = supabase!;
  return {
    local: false,
    async list() {
      const { data, error } = await db.from('homebrew').select('id, owner_id, campaign_id, name, data').eq('kind', 'spell');
      if (error) throw explain(error);
      return (data ?? []).flatMap((row) => {
        const spell = cleanCustomSpell({ ...(row.data as object), name: row.name, id: row.id }, row.id as string);
        return spell ? [{ ...spell, mine: row.owner_id === userId, campaignId: (row.campaign_id as string | null) ?? null }] : [];
      }).sort(byLevel);
    },
    async save(spell, campaignId) {
      const clean = cleanCustomSpell(spell);
      if (!clean) throw new Error('A spell needs a name.');
      const { id, name, ...data } = clean;
      // An id that is not one of the database's own means the spell is new.
      const existing = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id) ? await db.from('homebrew').select('id').eq('id', id).maybeSingle() : { data: null };
      const { error } = existing.data
        ? await db.from('homebrew').update({ name, data, campaign_id: campaignId }).eq('id', id)
        : await db.from('homebrew').insert({ kind: 'spell', name, data, campaign_id: campaignId });
      if (error) throw explain(error);
    },
    async remove(id) {
      const { error } = await db.from('homebrew').delete().eq('id', id);
      if (error) throw explain(error);
    },
  };
}

export function spellLibraryFor(userId: string | null): SpellLibrary {
  return userId && supabase ? remoteLibrary(userId) : localLibrary;
}
