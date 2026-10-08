// Spells (the handbooks call them powers, tactics, creations): the lists each class chooses from,
// what a character knows, and casting one with a slot. The handbooks print the full text of their own
// eleven spells; for every other spell they give only its name, so only its name is here.
import { spendResource, type ActionResult } from './actions';
import type { CharacterDoc, CharacterState } from './character';
import type { Sheet, SheetFeature, SheetResource, Stat } from './sheet';
import type { RuleEntry, TableDef } from './types';

/** What a spell says, for one a player writes. Everything but the text is optional. */
export interface SpellDetails {
  school?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  ritual?: boolean;
  text: string;
}

/** A spell in a player's own library: something to pick from, for any of their characters or their table's. */
export interface CustomSpell extends SpellDetails {
  id: string;
  name: string;
  level: number;
}

export const CUSTOM_SPELL_BOOK = 'Custom';
const line = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** A spell someone typed, with every part the right kind of thing; null when it has no name. */
export function cleanCustomSpell(raw: unknown, id?: string): CustomSpell | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = line(r.name, 120);
  const ownId = typeof r.id === 'string' && r.id ? r.id : id;
  if (!name || !ownId) return null;
  const level = typeof r.level === 'number' && Number.isFinite(r.level) ? Math.min(9, Math.max(0, Math.round(r.level))) : 0;
  return { id: ownId, name, level, ...cleanSpellDetails(r) };
}

export function cleanSpellDetails(raw: unknown): SpellDetails {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const details: SpellDetails = { text: typeof r.text === 'string' ? r.text.slice(0, 20000) : '' };
  for (const key of ['school', 'castingTime', 'range', 'components', 'duration'] as const) {
    const value = line(r[key]);
    if (value) details[key] = value;
  }
  if (r.ritual === true) details.ritual = true;
  return details;
}

/** A library spell as one a character knows: its details are copied, so changing or deleting the library entry later does not change the character. */
export function learnCustomSpell(spell: CustomSpell, id: string): KnownSpell {
  const { id: _library, name, level, ...details } = spell;
  return { id, name, level, own: details };
}

export interface KnownSpell {
  id: string;
  name: string;
  /** 0 for a cantrip. */
  level: number;
  /** The spell list it was picked from. */
  list?: string;
  /** For a spell the handbook prints in full: its entry. */
  entry?: string;
  /** A spell the player wrote: its details travel with the character, so the sheet, the printed sheet and the bot all have them. */
  own?: SpellDetails;
  /** For classes that prepare: whether it is prepared today. */
  prepared?: boolean;
  notes?: string;
}

export interface SheetSpell extends KnownSpell {
  /** The spell's words, when the handbook prints it or it is in the 5e SRD. */
  text?: string;
  tables?: TableDef[];
  ritual?: boolean;
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
const slugOf = (name: string) => name.toLowerCase().replace(/\s*\(ritual\)\s*/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/** The SRD prints some spells without the wizard's name the class lists give them: "Melf’s Acid Arrow" is its "Acid Arrow". */
const withoutOwner = (name: string) => name.replace(/^[A-Z][a-z]+[’']s\s+/, '');
export const SRD_BOOK = '5e SRD 5.1';

/** The entry holding a spell's text, by the name a class list gives it; undefined when no text is held. */
export function spellEntryFor(name: string, rules: Map<string, RuleEntry>): RuleEntry | undefined {
  for (const tried of [name, withoutOwner(name)]) {
    const entry = rules.get(`spell.${slugOf(tried)}`);
    if (entry?.kind === 'spell') return entry;
  }
  return undefined;
}

export interface SpellChoice { name: string; level: number; list: string; entry?: string }
export interface SpellListView { id: string; name: string; page: number; book: string; own: boolean; spells: SpellChoice[] }

/** Every spell list in the character's handbook, the lists of its own classes first, and the handbook's own spells last. */
export function spellLists(doc: Pick<CharacterDoc, 'classes'>, rules: Map<string, RuleEntry>): SpellListView[] {
  // The handbook's own spells make a list of their own; SRD spells are only the text behind names in the class lists.
  const custom = [...rules.values()].filter((e) => e.kind === 'spell' && e.source.book !== SRD_BOOK);
  const lists: SpellListView[] = [...rules.values()].filter((e) => e.kind === 'spellList').map((list) => ({
    id: list.id,
    name: list.name,
    page: list.source.page,
    book: list.source.book,
    own: doc.classes.some((c) => c.id === `class.${list.id.slice('spellList.'.length)}`),
    spells: Object.entries((list.levels ?? {}) as Record<string, string[]>).flatMap(([level, names]) =>
      names.map((name) => ({ name, level: Number(level), list: list.id, entry: spellEntryFor(name, rules)?.id }))),
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
  const asked = typeof slotLevel === 'number' && Number.isFinite(slotLevel) ? Math.round(slotLevel) : spell.level;
  const level = Math.min(9, Math.max(spell.level, asked));
  const id = `slots${level}`;
  if (!sheet.resources.some((r) => r.id === id)) {
    return { state, summary: `Cast ${spell.name}`, warning: `You have no ${ordinal(level)}-level slots; nothing was spent.` };
  }
  const spent = spendResource(state, sheet, id, 1);
  const up = level > spell.level ? ` at ${ordinal(level)} level` : '';
  return { state: spent.state, summary: `Cast ${spell.name}${up}: ${spent.summary}`, warning: spent.warning };
}
