// Multiclassing (EH10 p.209–210, EH8.8 p.208–209): what the handbook says changes when a
// character has levels in more than one class.
import { ABILITY_NAMES, type Ability, type AbilityScores, type RuleEntry, type SectionDef, type TableDef } from './types';

/**
 * "You determine your available spell slots by adding together all your levels in the priest,
 * skald, and tinkerer classes." The Virtuoso is v10's name for the Skald.
 */
export const COMBINED_CASTERS = ['class.priest', 'class.skald', 'class.virtuoso', 'class.tinkerer'];

/**
 * The Multiclass Spellcaster table the handbook points to (5e SRD 5.1): slots of each spell level,
 * 1st to 9th, by combined caster level.
 */
export const MULTICLASS_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Slots of one spell level for a combined caster level (0 beyond the table). */
export function multiclassSlots(combinedLevel: number, spellLevel: number): number {
  const row = MULTICLASS_SLOTS[Math.min(20, Math.max(1, combinedLevel)) - 1]!;
  return row[spellLevel - 1] ?? 0;
}

export interface Prerequisite {
  /** Every group must be met; within a group, any one ability is enough ("Strength 13 or Dexterity 13"). */
  groups: { ability: Ability; score: number }[][];
  /** "Cannot Multiclass Into". */
  barred: boolean;
  text: string;
}

const ABILITY_BY_PREFIX: Record<string, Ability> = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };

/** Reads the Multiclassing Prerequisites table from the rules data, by class name. */
export function multiclassPrerequisites(rules: Map<string, RuleEntry>): Map<string, Prerequisite> {
  const out = new Map<string, Prerequisite>();
  const rule = [...rules.values()].find((e) => e.kind === 'rule' && /^Multiclassing/.test(e.name));
  const tables: TableDef[] = [...((rule?.tables ?? []) as TableDef[]), ...((rule?.sections ?? []) as SectionDef[]).flatMap((s) => s.tables ?? [])];
  const table = tables.find((t) => /ability score minimum/i.test(t.rows[0]?.[1] ?? ''));
  for (const [name, text] of table?.rows.slice(1) ?? []) {
    if (!name || !text) continue;
    const groups = text.split(/\s+and\s+/i).map((part) =>
      part.split(/\s+or\s+/i).flatMap((one) => {
        const m = /([A-Za-z]+)\s+(\d+)/.exec(one);
        const ability = m ? ABILITY_BY_PREFIX[m[1]!.slice(0, 3).toLowerCase()] : undefined;
        return m && ability ? [{ ability, score: Number(m[2]) }] : [];
      }),
    );
    out.set(name.toLowerCase(), { groups: groups.filter((g) => g.length > 0), barred: /cannot multiclass/i.test(text), text });
  }
  return out;
}

/** v10 renamed two classes; its prerequisites table still lists them by their v8.8 names. */
const OLD_NAMES: Record<string, string> = { renegade: 'rogue', virtuoso: 'skald' };

/**
 * Why a combination of classes doesn't meet the handbook's prerequisites. Empty when it does.
 * These are warnings for the sheet: they never stop a player.
 */
export function multiclassWarnings(classNames: string[], scores: AbilityScores, rules: Map<string, RuleEntry>): string[] {
  if (classNames.length < 2) return [];
  const table = multiclassPrerequisites(rules);
  const warnings: string[] = [];
  classNames.forEach((name, index) => {
    const key = name.toLowerCase();
    const need = table.get(key) ?? table.get(OLD_NAMES[key] ?? '');
    if (!need) return;
    if (need.barred) {
      if (index > 0) warnings.push(`The handbook doesn't allow multiclassing into ${name}.`);
      return;
    }
    const unmet = need.groups.filter((group) => !group.some((g) => scores[g.ability] >= g.score));
    if (unmet.length > 0) {
      const wants = need.groups.map((group) => group.map((g) => `${ABILITY_NAMES[g.ability]} ${g.score}`).join(' or ')).join(' and ');
      warnings.push(`Multiclassing with ${name} asks for ${wants}.`);
    }
  });
  return warnings;
}
