// Reads class entries from data/rules: table columns, resources and formulas.
import { abilityMod, proficiencyBonus } from './core';
import { evaluateNumber, explain, type ExprScope } from './expr';
import { ABILITIES, type AbilityScores, type ClassEntry, type Derived, type FeatureDef, type RuleEntry, type RulesFile, type RulesVersion, type Source } from './types';

/** Adds `by` to every "page" inside a value (features, sections, tables), leaving the rest as it is. */
function shiftPages<T>(value: T, by: number): T {
  if (Array.isArray(value)) return value.map((v) => shiftPages(v, by)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, key === 'page' && typeof v === 'number' ? v + by : shiftPages(v, by)]),
    ) as T;
  }
  return value;
}

/**
 * Every rules entry by id. Give a rules version to get only that version's entries: an entry
 * shared between versions is cited from that version's own book (`sources`), with the pages
 * inside it moved by the same amount as its first page.
 */
export function indexRules(files: RulesFile[], version?: RulesVersion): Map<string, RuleEntry> {
  const byId = new Map<string, RuleEntry>();
  for (const file of files) {
    for (const entry of file.entries) {
      if (version && !entry.versions.includes(version)) continue;
      const other = version ? (entry.sources as Partial<Record<RulesVersion, Source>> | undefined)?.[version] : undefined;
      if (!other) {
        byId.set(entry.id, entry);
        continue;
      }
      const { source: _source, sources: _sources, ...rest } = entry;
      byId.set(entry.id, { ...shiftPages(rest, other.page - entry.source.page), source: other } as RuleEntry);
    }
  }
  return byId;
}

export function getClass(rules: Map<string, RuleEntry>, id: string): ClassEntry {
  const entry = rules.get(id);
  if (!entry || entry.kind !== 'class') throw new Error(`No class "${id}" in the rules data`);
  return entry as ClassEntry;
}

/** This level's value from every column of the class table. */
export function classColumns(cls: ClassEntry, classLevel: number): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [name, values] of Object.entries(cls.progression?.columns ?? {})) {
    // The table stops at 20. A level past it (nothing caps a character) keeps the last row's numbers,
    // and a level below 1 reads the first, so an odd level can never take the whole sheet down.
    const row = Math.min(values.length, Math.max(1, Math.floor(classLevel) || 1));
    const value = values[row - 1];
    if (value === undefined) throw new Error(`${cls.name} has no "${name}" column values`);
    out[name] = value;
  }
  return out;
}

export interface ClassContext {
  cls: ClassEntry;
  classLevel: number;
  /** Total character level; defaults to classLevel (single class). */
  totalLevel?: number;
  scores: AbilityScores;
}

/** The names a rules expression can use: level, prof, mod.<ability>, col.<column>. */
export function classScope(ctx: ClassContext): ExprScope {
  const mod: ExprScope = {};
  for (const ability of ABILITIES) mod[ability] = abilityMod(ctx.scores[ability]);
  return {
    level: ctx.classLevel,
    prof: proficiencyBonus(ctx.totalLevel ?? ctx.classLevel),
    mod,
    col: classColumns(ctx.cls, ctx.classLevel),
  };
}

export function classFormula(ctx: ClassContext, id: string): Derived {
  const formula = ctx.cls.formulas?.[id];
  if (!formula) throw new Error(`${ctx.cls.name} has no formula "${id}"`);
  return { ...explain(formula.expr, classScope(ctx)), page: ctx.cls.source.page };
}

/** Maximum of a class resource at this level (0 before its minLevel). */
export function resourceMax(ctx: ClassContext, id: string): number {
  const res = ctx.cls.resources?.find((r) => r.id === id);
  if (!res) throw new Error(`${ctx.cls.name} has no resource "${id}"`);
  if (ctx.classLevel < (res.minLevel ?? 1)) return 0;
  return evaluateNumber(res.max, classScope(ctx));
}

export function findFeature(entry: RuleEntry, name: string): FeatureDef {
  const feature = entry.features?.find((f) => f.name === name);
  if (!feature) throw new Error(`${entry.name} has no feature "${name}"`);
  return feature;
}
