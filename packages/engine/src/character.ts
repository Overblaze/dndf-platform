// The saved character document (the `doc` column of the characters table).
import type { Ability, AbilityScores, RulesVersion } from './types';

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
}

export interface CharacterDoc {
  schema: 1;
  name: string;
  rulesVersion: RulesVersion;
  race: { name: string; speed: number; /** "Counts as one size larger" steps, for carrying. */ sizeSteps?: number };
  classes: CharacterClass[];
  scores: AbilityScores;
  skills: string[];
  expertise: string[];
  extraSaves?: Ability[];
  /** Picks made from option groups, by choice id (furyFeatures → option ids). */
  choices: Record<string, string[]>;
  armor: ArmorDef | null;
  shield: boolean;
  weapons: WeaponDef[];
  willpower: { strengthenSelf: number; variantAdvancements?: number | null };
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
export function normalizeDoc(raw: unknown): CharacterDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Partial<CharacterDoc>;
  if (doc.schema !== 1 || !Array.isArray(doc.classes) || !doc.scores) return null;
  return {
    schema: 1,
    name: doc.name ?? 'Unnamed',
    rulesVersion: doc.rulesVersion ?? 'dndf-10',
    race: doc.race ?? { name: 'Human (Standard)', speed: 30 },
    classes: doc.classes,
    scores: doc.scores,
    skills: doc.skills ?? [],
    expertise: doc.expertise ?? [],
    extraSaves: doc.extraSaves,
    choices: doc.choices ?? {},
    armor: doc.armor ?? null,
    shield: doc.shield ?? false,
    weapons: doc.weapons ?? [],
    willpower: doc.willpower ?? { strengthenSelf: 0 },
    overrides: doc.overrides ?? {},
    state: { ...freshState(0), ...doc.state },
    notes: doc.notes ?? '',
    appearance: doc.appearance,
  };
}
