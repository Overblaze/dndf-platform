// Spells (the handbooks call them powers, tactics, creations): the lists each class chooses from,
// what a character knows, and casting one with a slot. The handbooks print the full text of their own
// eleven spells; for every other spell they give only its name, so only its name is here.
import { spendResource, type ActionResult } from './actions';
import type { CharacterDoc, CharacterState } from './character';
import type { Sheet, SheetFeature, SheetResource, Stat } from './sheet';
import type { RuleEntry } from './types';

export interface KnownSpell {
  id: string;
  name: string;
  /** 0 for a cantrip. */
  level: number;
  /** The spell list it was picked from. */
  list?: string;
  /** For a spell the handbook prints in full: its entry. */
  entry?: string;
  /** For classes that prepare: whether it is prepared today. */
  prepared?: boolean;
  notes?: string;
}

export interface SheetSpell extends KnownSpell {
  /** The handbook's own words, when it prints the spell. */
  text?: string;
  school?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  page?: number;
  book?: string;
  rolls: SheetFeature['rolls'];
  /** Slot levels it can be cast with now (its own level and higher, where a slot is left). */
  castableWith: number[];
}

export interface SheetSpells {
  /** Save DC and attack modifier, for each class that casts. */
  casting: { from: string; dc?: Stat; attack?: Stat }[];
  slots: SheetResource[];
  /** What the class table says about how many: "Cantrips known 3", "Powers prepared 6". */
  limits: { label: string; value: string; from: string }[];
  known: SheetSpell[];
  cantrips: number;
  leveled: number;
  prepared: number;
}

export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
export const spellLevelName = (level: number) => (level === 0 ? 'Cantrips' : `${ordinal(level)} level`);
const slugOf = (name: string) => name.toLowerCase().replace(/\s*\(ritual\)\s*/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export interface SpellChoice { name: string; level: number; list: string; entry?: string }
export interface SpellListView { id: string; name: string; page: number; book: string; own: boolean; spells: SpellChoice[] }

/** Every spell list in the character's handbook, the lists of its own classes first, and the handbook's own spells last. */
export function spellLists(doc: Pick<CharacterDoc, 'classes'>, rules: Map<string, RuleEntry>): SpellListView[] {
  const custom = [...rules.values()].filter((e) => e.kind === 'spell');
  const byName = new Map(custom.map((e) => [slugOf(e.name), e]));
  const lists: SpellListView[] = [...rules.values()].filter((e) => e.kind === 'spellList').map((list) => ({
    id: list.id,
    name: list.name,
    page: list.source.page,
    book: list.source.book,
    own: doc.classes.some((c) => c.id === `class.${list.id.slice('spellList.'.length)}`),
    spells: Object.entries((list.levels ?? {}) as Record<string, string[]>).flatMap(([level, names]) =>
      names.map((name) => ({ name, level: Number(level), list: list.id, entry: byName.get(slugOf(name))?.id }))),
  }));
  lists.sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name));
  if (custom.length) {
    const first = custom.reduce((a, b) => (a.source.page <= b.source.page ? a : b));
    lists.push({
      id: 'custom', name: 'Spells printed in the handbook', page: first.source.page, book: first.source.book, own: false,
      spells: custom.map((e) => ({ name: e.name, level: typeof e.level === 'number' ? e.level : 0, list: 'custom', entry: e.id })).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    });
  }
  return lists;
}

/**
 * Casts a known spell: a cantrip costs nothing, anything else spends one slot of the level chosen
 * (its own level or higher). With no slot left it still goes ahead and says so.
 */
export function castSpell(state: CharacterState, sheet: Sheet, spell: Pick<KnownSpell, 'name' | 'level'>, slotLevel?: number): ActionResult {
  if (spell.level <= 0) return { state, summary: `Cast ${spell.name}` };
  const level = Math.max(spell.level, Math.round(slotLevel ?? spell.level));
  const id = `slots${level}`;
  if (!sheet.resources.some((r) => r.id === id)) {
    return { state, summary: `Cast ${spell.name}`, warning: `You have no ${ordinal(level)}-level slots; nothing was spent.` };
  }
  const spent = spendResource(state, sheet, id, 1);
  const up = level > spell.level ? ` at ${ordinal(level)} level` : '';
  return { state: spent.state, summary: `Cast ${spell.name}${up}: ${spent.summary}`, warning: spent.warning };
}
