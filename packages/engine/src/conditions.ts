// Conditions, and what each does to the sheet's numbers and rolls: the 5th Edition conditions as the
// System Reference Document 5.1 defines them (Appendix PH-A, pages 358–359). The handbooks use them
// without reprinting them. A condition the player types in themselves is kept as a note and does nothing.
//
// Damage resistance, immunity and vulnerability (SRD 5.1 p. 97): resistance halves, vulnerability doubles,
// immunity takes none; resistance is applied before vulnerability.
import type { Ability } from './types';

export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'] as const;

export interface ConditionEffects {
  /** d20 rolls the condition gives advantage or disadvantage on. */
  edges?: { mode: 'advantage' | 'disadvantage'; on: 'attack' | 'check' | 'save'; ability?: Ability }[];
  /** Saving throws that fail without a roll. */
  autoFailSaves?: Ability[];
  speedZero?: boolean;
  /** Damage it gives resistance to ("all"), and what it makes the creature immune to. */
  resist?: string[];
  immune?: string[];
  /** What it does, for the sheet's "In effect" list: the things a player needs to see at a glance. */
  notes: string[];
}

/** Each line of `notes` is a plain restatement of the SRD's bullet; the Library and the Status tab show the SRD's own words. */
export const CONDITION_EFFECTS: Record<string, ConditionEffects> = {
  Blinded: { edges: [{ mode: 'disadvantage', on: 'attack' }], notes: ['Can’t see; fails any check that needs sight', 'Attacks against you have advantage'] },
  Charmed: { notes: ['Can’t attack the charmer; the charmer has advantage on social checks with you'] },
  Deafened: { notes: ['Can’t hear; fails any check that needs hearing'] },
  Frightened: { edges: [{ mode: 'disadvantage', on: 'check' }, { mode: 'disadvantage', on: 'attack' }], notes: ['Disadvantage on ability checks and attacks while the source of fear is in sight', 'Can’t willingly move closer to it'] },
  Grappled: { speedZero: true, notes: ['Speed 0'] },
  Incapacitated: { notes: ['Can’t take actions or reactions'] },
  Invisible: { edges: [{ mode: 'advantage', on: 'attack' }], notes: ['Attacks against you have disadvantage'] },
  Paralyzed: { speedZero: true, autoFailSaves: ['str', 'dex'], notes: ['Incapacitated; can’t move or speak', 'Attacks against you have advantage, and are critical hits from within 5 feet'] },
  Petrified: { speedZero: true, autoFailSaves: ['str', 'dex'], resist: ['all'], immune: ['poison', 'disease'], notes: ['Incapacitated; can’t move or speak', 'Attacks against you have advantage'] },
  Poisoned: { edges: [{ mode: 'disadvantage', on: 'attack' }, { mode: 'disadvantage', on: 'check' }], notes: ['Disadvantage on attack rolls and ability checks'] },
  Prone: { edges: [{ mode: 'disadvantage', on: 'attack' }], notes: ['Can only crawl until you stand', 'Attacks against you have advantage from within 5 feet, disadvantage from farther'] },
  Restrained: { speedZero: true, edges: [{ mode: 'disadvantage', on: 'attack' }, { mode: 'disadvantage', on: 'save', ability: 'dex' }], notes: ['Speed 0', 'Attacks against you have advantage'] },
  Stunned: { speedZero: true, autoFailSaves: ['str', 'dex'], notes: ['Incapacitated; can’t move', 'Attacks against you have advantage'] },
  Unconscious: { speedZero: true, autoFailSaves: ['str', 'dex'], notes: ['Incapacitated; can’t move or speak; drops what is held and falls prone', 'Attacks against you have advantage, and are critical hits from within 5 feet'] },
};

/** What a character shrugs off or is hurt more by, each with where it comes from. */
export interface Defenses {
  resist: { what: string; from: string }[];
  immune: { what: string; from: string }[];
  vulnerable: { what: string; from: string }[];
  /** Conditions that cannot be put on the character. */
  conditions: { what: string; from: string }[];
}

/** The player's own list, saved with the character. */
export interface OwnDefenses { resist?: string[]; immune?: string[]; vulnerable?: string[]; conditions?: string[] }
export const DEFENSE_KINDS = ['resist', 'immune', 'vulnerable', 'conditions'] as const;
export type DefenseKind = (typeof DEFENSE_KINDS)[number];

const tidy = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40) : '');
export function cleanDefenses(raw: unknown): OwnDefenses | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: OwnDefenses = {};
  for (const kind of DEFENSE_KINDS) {
    const list = (raw as Record<string, unknown>)[kind];
    const kept = Array.isArray(list) ? [...new Set(list.map(tidy).filter(Boolean))].slice(0, 30) : [];
    if (kept.length) out[kind] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * "Resistance to cold and fire damage", "Immunity to poison damage", "Vulnerable to fire": what a feature's
 * standing note says about damage, so that a note already on the sheet counts without being typed again.
 */
export function defensesInText(text: string): { kind: 'resist' | 'immune' | 'vulnerable'; what: string }[] {
  const m = /^\s*(resistan(?:ce|t)|immun(?:ity|e)|vulnerab(?:ility|le)) to (.+?)(?: damage)?\.?\s*$/i.exec(text);
  if (!m) return [];
  const kind = /^res/i.test(m[1]!) ? 'resist' : /^imm/i.test(m[1]!) ? 'immune' : 'vulnerable';
  const types = m[2]!.toLowerCase().replace(/\ball damage\b/, 'all').split(/\s*(?:,|\band\b|\bor\b)\s*/).map((t) => t.trim()).filter(Boolean);
  // Only what is plainly a list of damage types: a longer sentence is left as the note it is.
  if (!types.length || !types.every((t) => t === 'all' || (DAMAGE_TYPES as readonly string[]).includes(t))) return [];
  return types.map((what) => ({ kind, what }));
}

/**
 * Damage of one type after what the character resists, is immune to or is vulnerable to.
 * With no type given, the damage is taken as it is.
 */
export function damageAfterDefenses(amount: number, type: string | undefined, defenses: Defenses): { amount: number; why: string | null } {
  const n = Math.max(0, Math.floor(amount));
  const t = (type ?? '').trim().toLowerCase();
  if (!t || n === 0) return { amount: n, why: null };
  const hit = (list: { what: string; from: string }[]) => list.find((d) => d.what === t || d.what === 'all');
  const immune = hit(defenses.immune);
  if (immune) return { amount: 0, why: `immune to ${t} (${immune.from})` };
  const resist = hit(defenses.resist);
  const weak = hit(defenses.vulnerable);
  let out = n;
  const why: string[] = [];
  if (resist) { out = Math.floor(out / 2); why.push(`resistance to ${resist.what === 'all' ? 'all damage' : t} (${resist.from}): halved`); }
  if (weak) { out *= 2; why.push(`vulnerable to ${weak.what === 'all' ? 'all damage' : t} (${weak.from}): doubled`); }
  return { amount: out, why: why.length ? why.join('; ') : null };
}
