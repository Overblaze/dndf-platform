// DnDF rows of docs/FORMULAS.md (v10 Expanded Handbook pages).
import type { BreakdownLine, Derived } from './types';

export const WILLPOWER_MAX = 20;

export interface WillpowerInput {
  /** Total character level. */
  level: number;
  /** How many times Strengthen Self has been taken (+2 each). */
  strengthenSelf?: number;
  /** Variant rule: start at 0 and gain 1 per Spiritual Advancement instead of per level. */
  variant?: { spiritualAdvancements: number };
}

/** 1 at level 1, +1 per level gained; Strengthen Self +2; never above 20 in total — v10 p221. */
export function willpower(input: WillpowerInput): Derived {
  const lines: BreakdownLine[] = [];
  if (input.variant) {
    lines.push({ label: 'Spiritual Advancements (variant)', value: input.variant.spiritualAdvancements });
  } else {
    lines.push({ label: 'Level', value: input.level });
  }
  if (input.strengthenSelf) {
    lines.push({ label: `Strengthen Self × ${input.strengthenSelf}`, value: 2 * input.strengthenSelf });
  }
  const sum = lines.reduce((acc, l) => acc + Number(l.value), 0);
  if (sum > WILLPOWER_MAX) lines.push({ label: `Willpower maximum ${WILLPOWER_MAX}`, value: WILLPOWER_MAX - sum });
  return { value: Math.min(sum, WILLPOWER_MAX), lines, page: 221 };
}

function halfWillpower(wp: number, base: number, page?: number): Derived {
  const half = Math.ceil(wp / 2);
  return {
    value: base + half,
    lines: [
      { label: 'Base', value: base },
      { label: `Half Willpower ${wp}, rounded up`, value: half },
    ],
    page,
  };
}

/** 10 + ceil(Willpower / 2) — v10 p221. */
export function hakiSaveDc(wp: number): Derived {
  return halfWillpower(wp, 10, 221);
}

/** Table ruling: 2 + ceil(Willpower / 2). Only custom / original-PHB Haki features use it. */
export function hakiAttackBonus(wp: number): Derived {
  return halfWillpower(wp, 2);
}

/** 10 + ceil(Willpower / 2) — v10 p242. */
export function devilFruitSaveDc(wp: number): Derived {
  return halfWillpower(wp, 10, 242);
}

/** 2 + ceil(Willpower / 2) — v10 p242. */
export function devilFruitAttackBonus(wp: number): Derived {
  return halfWillpower(wp, 2, 242);
}
