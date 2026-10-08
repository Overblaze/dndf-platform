// The saved character document (the `doc` column of the characters table).
import type { ScoreOrigin } from './abilityScores';
import type { CustomClass } from './customClass';
import type { InventoryItem } from './inventory';
import { cleanSpellDetails, type KnownSpell } from './spells';
import type { PuristPick, SurgePick, SurgeRecord } from './surges';
import { ABILITIES, type Ability, type AbilityScores, type RulesVersion } from './types';

export interface WeaponDef {
  id: string;
  name: string;
  /** Damage dice, e.g. "1d6". */
  damage: string;
  damageType: string;
  category: 'simple' | 'martial' | 'improvised';
  ranged?: boolean;
  finesse?: boolean;
  twoHanded?: boolean;
  heavy?: boolean;
  /** Use this ability for attack and damage, whatever the weapon would normally use (Harmonic Weaponry, Hell's Duelist). */
  ability?: Ability;
  /** Item bonus to attack and damage. */
  bonus?: number;
  /** Set to force proficiency on or off; otherwise it comes from the class. */
  proficient?: boolean;
}

export interface ArmorDef {
  name: string;
  /** Armor formula: base + Dex modifier, limited to dexCap when set (0 for heavy armor). */
  base: number;
  dexCap?: number | null;
  /** Set to force proficiency on or off; otherwise it comes from the classes, subclasses and feats. */
  proficient?: boolean;
}

export const CUSTOM_BONUS_TYPES = ['ac', 'speed', 'initiative', 'hp', 'attack', 'damage'] as const;
export type CustomBonusType = (typeof CUSTOM_BONUS_TYPES)[number];

export interface CustomFeature {
  id: string;
  name: string;
  /** The player's own words; shown where book text would be. */
  text: string;
  /** Where it comes from, in the player's words ("DM boon, session 12"). */
  origin?: string;
  action?: 'action' | 'bonus' | 'reaction';
  uses?: { max: number; recharge: 'short' | 'long' };
  rolls?: { label: string; dice: string; kind: 'damage' | 'heal' | 'tempHp' | 'other' }[];
  /** Numbers it adds to the sheet. */
  bonuses?: { type: CustomBonusType; value: number }[];
  /** A standing line for "In effect" (a resistance, an advantage). */
  note?: string;
  /** True when the bonuses and note only count while a switch on the sheet is on. */
  switched?: boolean;
}

export interface BorrowedFeature {
  /** The rules entry it comes from (a class, subclass or option list) and the feature's name there. */
  entry: string;
  name: string;
}

export interface CharacterClass {
  id: string;
  level: number;
  subclass?: string;
  /** Hit points rolled at each level after the first; missing levels use the average. */
  hpRolls?: (number | null)[];
}

export interface CharacterState {
  hp: number;
  tempHp: number;
  hitDiceSpent: number;
  /** Uses spent, by resource id. */
  spent: Record<string, number>;
  toggles: Record<string, boolean>;
  trackers: Record<string, number>;
  /** Uses since the last rest, by counter id (Undying Frenzy). */
  counters: Record<string, number>;
  conditions: string[];
  exhaustion: number;
  deathSaves: { successes: number; failures: number };
  dreamPointsSpent: number;
}

/** How the player has dressed up their sheet. Purely cosmetic. */
export interface SheetAppearance {
  /** A built-in background, or `ref` pointing at a picture the player uploaded. */
  background?: { kind: 'preset'; id: string } | { kind: 'image'; ref: string };
  /** How solid the cards are over the background, 50–100 (percent). */
  cardOpacity?: number;
  /** Box color as #rrggbb. Text, borders and tiles are worked out from it. Unset = the theme's parchment. */
  cardColor?: string;
}

export interface CharacterDoc {
  schema: 1;
  name: string;
  rulesVersion: RulesVersion;
  /** `id` / `subraceId` point at rules entries when the race was picked from the book; name and speed can be typed by hand. */
  race: { id?: string; subraceId?: string; name: string; speed: number; /** Extra "counts as one size larger" steps, for carrying. */ sizeSteps?: number };
  background?: { id: string };
  /** Every crew role the character holds; a character can hold more than one (shipwright and helmsman). */
  crewRoles?: { id: string }[];
  /** How a single crew role was saved before `crewRoles`; still read, never written. */
  crewRole?: { id: string };
  /** Feat entry ids. */
  feats?: string[];
  classes: CharacterClass[];
  scores: AbilityScores;
  /** How the starting scores were set (array, point buy, rolls), so the builder can show it again. `scores` is always what counts. */
  scoreOrigin?: ScoreOrigin;
  skills: string[];
  expertise: string[];
  extraSaves?: Ability[];
  /** Picks made from option groups, by choice id (furyFeatures → option ids). */
  choices: Record<string, string[]>;
  armor: ArmorDef | null;
  shield: boolean;
  weapons: WeaponDef[];
  /** What the character carries or owns, besides the armor worn and weapons above. */
  inventory?: InventoryItem[];
  /** Berries (฿) in hand. */
  money?: number;
  /** Spells (powers, tactics, creations) the character knows. */
  spells?: KnownSpell[];
  willpower: { strengthenSelf: number; variantAdvancements?: number | null };
  /** Every Haki feature and Standard Advancement unlocked by a Spirit Surge, oldest first. */
  surges?: SurgeRecord[];
  /** Whether the DM (or the d20) says this character can awaken the Color of the Supreme King. */
  qualitiesOfAKing?: boolean;
  /** Haki Purist improvements, in the order they were taken. */
  hakiPurist?: PuristPick[];
  /** Classes the player wrote for this character. A class in `classes` with id `class.custom.<id>` is one of these. */
  customClasses?: CustomClass[];
  /** Class, subclass and option features taken off this character, by feature key ("class.warrior/second_wind"). */
  removedFeatures?: string[];
  /** Features the player wrote: a boon from the DM, a house rule, something from a book the app does not hold. */
  customFeatures?: CustomFeature[];
  /** Features taken from anywhere in the rules data, outside the character's own classes. They bring their own uses. */
  borrowedFeatures?: BorrowedFeature[];
  /** The player's own numbers, by stat key. The calculated value stays available. */
  overrides: Record<string, number>;
  state: CharacterState;
  notes: string;
  appearance?: SheetAppearance;
}

/** Table rulings a DM can change per campaign (CLAUDE.md, "Table rulings already decided"). */
export interface CampaignSettings {
  /** Show the Haki attack bonus, 2 + ceil(Willpower / 2). */
  hakiAttackRuling: boolean;
  /** Hit dice returned by a long rest. */
  longRestHitDice: 'all' | 'half';
}

export const DEFAULT_SETTINGS: CampaignSettings = { hakiAttackRuling: true, longRestHitDice: 'all' };

export function freshState(maxHp: number): CharacterState {
  return {
    hp: maxHp,
    tempHp: 0,
    hitDiceSpent: 0,
    spent: {},
    toggles: {},
    trackers: {},
    counters: {},
    conditions: [],
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    dreamPointsSpent: 0,
  };
}

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed',
  'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;

export const SKILLS: { id: string; name: string; ability: Ability }[] = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animal_handling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleight_of_hand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' },
];

/** Fills in anything missing from a saved document, so older saves keep opening. Returns null if it isn't one. */
/** A value written out with its fields in a fixed order and nothing undefined, so two copies can be compared. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v === undefined ? null : v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Whether two copies of a character hold the same thing. A database returns a document with its
 * fields in its own order, so comparing the text of two copies would call identical ones different.
 */
export function sameDoc(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** The character's crew roles, each once, whichever way they were saved. */
export function crewRolesOf(doc: Pick<CharacterDoc, 'crewRoles' | 'crewRole'>): { id: string }[] {
  const ids = [...(doc.crewRoles ?? []), ...(doc.crewRole ? [doc.crewRole] : [])].map((r) => r?.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)].map((id) => ({ id }));
}

/** Ability scores as whole numbers. A score that is missing or not a number becomes 10, so it can never turn every total into "not a number". */
function cleanScores(scores: Partial<Record<Ability, unknown>>): Record<Ability, number> {
  const clean = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 10);
  return { str: clean(scores.str), dex: clean(scores.dex), con: clean(scores.con), int: clean(scores.int), wis: clean(scores.wis), cha: clean(scores.cha) };
}

/** Each record with an id of its own: a missing one is made up, and a second use of one is renamed. Everything on the sheet is told apart by these. */
function uniqueIds<T extends { id?: unknown }>(list: T[], prefix: string): (T & { id: string })[] {
  const seen = new Set<string>();
  return list.map((item, i) => {
    let id = typeof item.id === 'string' && item.id ? item.id : `${prefix}-${i + 1}`;
    for (let n = 2; seen.has(id); n++) id = `${typeof item.id === 'string' && item.id ? item.id : prefix}-${i + 1}-${n}`;
    seen.add(id);
    return { ...item, id };
  });
}

/** What was chosen for a Spirit Surge advancement, keeping only the parts that are what they should be. */
function cleanPick(raw: unknown): SurgePick | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const p = raw as Record<string, unknown>;
  const pick: SurgePick = {};
  if (typeof p.ability === 'string' && (ABILITIES as readonly string[]).includes(p.ability)) pick.ability = p.ability as Ability;
  if (p.willpower === true) pick.willpower = true;
  if (typeof p.skill === 'string' && p.skill) pick.skill = p.skill;
  const prof = p.proficiency as { kind?: unknown; id?: unknown } | null | undefined;
  if (prof && typeof prof === 'object' && (prof.kind === 'armor' || prof.kind === 'weapon') && typeof prof.id === 'string' && prof.id) pick.proficiency = { kind: prof.kind, id: prof.id };
  if (typeof p.resource === 'string' && p.resource) pick.resource = p.resource;
  if (typeof p.note === 'string' && p.note) pick.note = p.note;
  return Object.keys(pick).length ? pick : undefined;
}

export function normalizeDoc(raw: unknown): CharacterDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Partial<CharacterDoc>;
  if (doc.schema !== 1 || !Array.isArray(doc.classes) || !doc.scores || typeof doc.scores !== 'object') return null;
  // A save can be older than the app, edited by hand, or damaged. Everything read from it is checked
  // for its shape here, once, so nothing later has to wonder whether a list is a list.
  const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  const objects = <T>(value: unknown): T[] | undefined => (Array.isArray(value) ? (value.filter(isObject) as T[]) : undefined);
  const whole = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback);
  const race: Record<string, unknown> = isObject(doc.race) ? doc.race : {};
  const state = isObject(doc.state) ? (doc.state as Partial<CharacterState>) : {};
  const fresh = freshState(0);
  return {
    schema: 1,
    name: typeof doc.name === 'string' ? doc.name : 'Unnamed',
    rulesVersion: doc.rulesVersion === 'dndf-8.8' ? 'dndf-8.8' : 'dndf-10',
    race: {
      ...(race as Partial<CharacterDoc['race']>),
      name: typeof race.name === 'string' ? race.name : 'Human (Standard)',
      speed: whole(race.speed, 30),
    },
    background: isObject(doc.background) && typeof doc.background.id === 'string' ? doc.background : undefined,
    crewRoles: crewRolesOf({ crewRoles: objects(doc.crewRoles), crewRole: isObject(doc.crewRole) ? doc.crewRole : undefined }),
    feats: Array.isArray(doc.feats) ? strings(doc.feats) : undefined,
    classes: (objects<CharacterClass>(doc.classes) ?? []).filter((c) => typeof c.id === 'string').map((c) => ({ ...c, level: Math.max(0, whole(c.level, 1)) })),
    scores: cleanScores(doc.scores),
    scoreOrigin: isObject(doc.scoreOrigin) ? doc.scoreOrigin : undefined,
    customClasses: objects(doc.customClasses),
    removedFeatures: Array.isArray(doc.removedFeatures) ? strings(doc.removedFeatures) : undefined,
    customFeatures: objects(doc.customFeatures),
    borrowedFeatures: objects(doc.borrowedFeatures),
    skills: strings(doc.skills),
    expertise: strings(doc.expertise),
    extraSaves: Array.isArray(doc.extraSaves) ? (strings(doc.extraSaves) as Ability[]) : undefined,
    choices: isObject(doc.choices) ? Object.fromEntries(Object.entries(doc.choices).map(([id, picks]) => [id, strings(picks)])) : {},
    armor: isObject(doc.armor) && typeof doc.armor.base === 'number' ? doc.armor : null,
    shield: doc.shield === true,
    weapons: (objects<WeaponDef>(doc.weapons) ?? []).map((w, i) => ({ ...w, id: typeof w.id === 'string' ? w.id : `weapon-${i}`, name: typeof w.name === 'string' ? w.name : 'Weapon', damage: typeof w.damage === 'string' ? w.damage : '', damageType: typeof w.damageType === 'string' ? w.damageType : '' })),
    inventory: !Array.isArray(doc.inventory) ? undefined : uniqueIds(objects<InventoryItem>(doc.inventory) ?? [], 'item').map((item) => ({
      ...item,
      name: typeof item.name === 'string' ? item.name : 'Item',
      qty: Math.max(0, whole(item.qty, 1)),
      weight: typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight >= 0 ? item.weight : undefined,
    })),
    spells: !Array.isArray(doc.spells) ? undefined : uniqueIds((objects<KnownSpell>(doc.spells) ?? []).filter((spell) => typeof spell.name === 'string' && spell.name.trim()), 'spell').map((spell) => ({
      ...spell,
      level: Math.min(9, Math.max(0, whole(spell.level, 0))),
      own: spell.own === undefined ? undefined : cleanSpellDetails(spell.own),
    })),
    money: typeof doc.money === 'number' && Number.isFinite(doc.money) ? Math.round(doc.money) : undefined,
    willpower: isObject(doc.willpower)
      ? { ...doc.willpower, strengthenSelf: Math.max(0, whole(doc.willpower.strengthenSelf, 0)), variantAdvancements: typeof doc.willpower.variantAdvancements === 'number' && Number.isFinite(doc.willpower.variantAdvancements) ? Math.max(0, Math.round(doc.willpower.variantAdvancements)) : doc.willpower.variantAdvancements === null ? null : undefined }
      : { strengthenSelf: 0 },
    surges: !Array.isArray(doc.surges) ? undefined : uniqueIds((objects<SurgeRecord>(doc.surges) ?? []).filter((r) => typeof r.entry === 'string'), 'surge').map((r) => ({ ...r, pick: cleanPick(r.pick) })),
    qualitiesOfAKing: doc.qualitiesOfAKing === true ? true : undefined,
    hakiPurist: Array.isArray(doc.hakiPurist) ? doc.hakiPurist.filter((p): p is PuristPick => p === 'quality' || p === 'quantity' || p === 'stamina') : undefined,
    overrides: isObject(doc.overrides) ? Object.fromEntries(Object.entries(doc.overrides).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number> : {},
    state: {
      ...fresh,
      ...state,
      hp: whole(state.hp, 0),
      tempHp: Math.max(0, whole(state.tempHp, 0)),
      hitDiceSpent: Math.max(0, whole(state.hitDiceSpent, 0)),
      exhaustion: Math.min(6, Math.max(0, whole(state.exhaustion, 0))),
      dreamPointsSpent: Math.max(0, whole(state.dreamPointsSpent, 0)),
      spent: isObject(state.spent) ? state.spent : fresh.spent,
      toggles: isObject(state.toggles) ? state.toggles : fresh.toggles,
      trackers: isObject(state.trackers) ? state.trackers : fresh.trackers,
      counters: isObject(state.counters) ? state.counters : fresh.counters,
      conditions: strings(state.conditions),
      deathSaves: isObject(state.deathSaves) ? { successes: whole(state.deathSaves.successes, 0), failures: whole(state.deathSaves.failures, 0) } : fresh.deathSaves,
    },
    notes: typeof doc.notes === 'string' ? doc.notes : '',
    appearance: isObject(doc.appearance) ? doc.appearance : undefined,
  };
}
