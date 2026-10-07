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

export interface FeatureDef {
  level: number;
  name: string;
  text: string;
  page: number;
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
  features: FeatureDef[];
  progression?: { columns: Record<string, (number | string)[]> };
  resources?: ResourceDef[];
  formulas?: Record<string, { label: string; expr: string }>;
}

export interface RulesFile {
  entries: RuleEntry[];
}
