// Core 5e rows of docs/FORMULAS.md. Round down unless stated.
import type { Derived } from './types';

/** floor((score − 10) / 2) — v10 p10. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** 2 + floor((total level − 1) / 4) — v10 p209. */
export function proficiencyBonus(totalLevel: number): number {
  return 2 + Math.floor((totalLevel - 1) / 4);
}

/** "+4" / "-1" / "+0". */
export function signed(n: number): string {
  return n < 0 ? `${n}` : `+${n}`;
}

/**
 * Level 1: hit die max + Con; each later level: average (die / 2 + 1) or the roll, + Con.
 * Con is applied to every level, so Con changes are retroactive — v10 p85.
 * `first: false` is for a class added by multiclassing, which has no maximum first die.
 */
export function maxHp(input: { hitDie: number; level: number; conMod: number; rolls?: (number | null)[]; first?: boolean }): Derived {
  const { hitDie, level, conMod, rolls = [], first = true } = input;
  const average = hitDie / 2 + 1;
  const laterLevels = first ? level - 1 : level;
  const rolled = rolls.slice(0, laterLevels).filter((r): r is number => typeof r === 'number');
  const averaged = laterLevels - rolled.length;
  const lines = [];
  if (first) lines.push({ label: `Level 1: d${hitDie} maximum`, value: hitDie });
  if (averaged > 0) lines.push({ label: `${averaged} level${averaged > 1 ? 's' : ''} × ${average} (average)`, value: averaged * average });
  if (rolled.length > 0) lines.push({ label: `${rolled.length} level${rolled.length > 1 ? 's' : ''} rolled`, value: rolled.reduce((a, b) => a + b, 0) });
  lines.push({ label: `Constitution modifier ${signed(conMod)} × ${level} levels`, value: conMod * level });
  return { value: lines.reduce((sum, l) => sum + l.value, 0), lines, page: 85 };
}
