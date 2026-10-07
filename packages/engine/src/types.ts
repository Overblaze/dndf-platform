export const RULES_VERSIONS = ['dndf-8.8', 'dndf-10'] as const;
export type RulesVersion = (typeof RULES_VERSIONS)[number];

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** One row of a "how was this number worked out" box. */
export interface BreakdownLine {
  label: string;
  value: number | string;
}

/** A derived value together with the line-by-line math behind it. */
export interface Derived<T = number> {
  value: T;
  lines: BreakdownLine[];
  page?: number;
  /** The book `page` is in; on a sheet, the character's handbook unless said otherwise. */
  book?: string;
}

export interface Source {
  book: string;
  page: number;
}

export interface UsesDef {
  max: number | string;
  recharge: string;
}

export interface EffectDef {
  type: string;
  expr?: string;
  value?: number;
  when?: string;
  ability?: Ability;
  max?: number;
  [key: string]: unknown;
}

export interface TableDef {
  rows: string[][];
  page: number;
}

/** A named part of a feature printed under its own smaller heading. */
export interface SectionDef {
  name: string;
  text: string;
  page: number;
  tables?: TableDef[];
}

export interface FeatureDef {
  level: number;
  name: string;
  text: string;
  page: number;
  sections?: SectionDef[];
  tables?: TableDef[];
  effects?: EffectDef[];
  uses?: UsesDef | string;
  choices?: { id: string; count: number | string; from: string; relearn?: string };
  [key: string]: unknown;
}

export interface ResourceDef {
  id: string;
  name: string;
  max: number | string;
  recharge: string;
  minLevel?: number;
  /** Something the player must confirm before a rest refills this. */
  confirm?: string;
}

/** The fields every entry in data/rules carries. */
export interface RuleEntry {
  id: string;
  kind: string;
  name: string;
  versions: RulesVersion[];
  source: Source;
  features?: FeatureDef[];
  [key: string]: unknown;
}

export interface ClassEntry extends RuleEntry {
  kind: 'class';
  hitDie: number;
  savingThrows?: Ability[];
  features: FeatureDef[];
  /** The feature that grants the subclass, and the levels its features arrive. */
  subclass?: { label: string; level: number; featureLevels: number[] };
  progression?: { columns: Record<string, (number | string)[]> };
  resources?: ResourceDef[];
  formulas?: Record<string, { label: string; expr: string }>;
}

export interface RulesFile {
  entries: RuleEntry[];
}

export interface RollDef {
  label: string;
  /** Dice template; {…} parts are expressions. */
  dice: string;
  kind: 'damage' | 'heal' | 'tempHp' | 'other';
}

export interface OnUseDef {
  /** refill / regain act on a resource; addTracker moves a tracker (Hybrid Points) by `value`. */
  type: 'refill' | 'regain' | 'addTracker';
  resource?: string;
  tracker?: string;
  value?: number | string;
}

export interface CounterDef {
  id: string;
  label: string;
  expr: string;
  reset: string;
}

export interface ToggleDef {
  id: string;
  label: string;
  effects?: EffectDef[];
}

export interface OptionDef {
  id: string;
  name: string;
  text: string;
  page: number;
  [key: string]: unknown;
}

export interface TrackerDef {
  id: string;
  name: string;
  min: number;
  max: number | string;
  /** Rest that puts the tracker back to its minimum. */
  reset?: string;
  /** Class level at which the tracker appears. */
  minLevel?: number;
  page?: number;
  levels?: { value: number; label: string; text?: string }[];
}

export interface TraitDef {
  name: string;
  text: string;
  page: number;
  tables?: TableDef[];
}
