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
 * Level 1: hit die max + Con; each later level: average (die / 2 + 1) + Con.
 * Con is applied to every level, so Con changes are retroactive — v10 p85.
 */
export function maxHp(input: { hitDie: number; level: number; conMod: number }): Derived {
  const { hitDie, level, conMod } = input;
  const later = level - 1;
  const average = hitDie / 2 + 1;
  const lines = [
    { label: `Level 1: d${hitDie} maximum`, value: hitDie },
    { label: `Levels 2–${level}: ${later} × ${average} (average)`, value: later * average },
    { label: `Constitution modifier ${signed(conMod)} × ${level} levels`, value: conMod * level },
  ];
  if (later === 0) lines.splice(1, 1);
  return { value: lines.reduce((sum, l) => sum + l.value, 0), lines };
}
