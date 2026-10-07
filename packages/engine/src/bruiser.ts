// Bruiser (v10) rows of docs/FORMULAS.md. Table values and expressions come
// from data/rules/dndf-10/bruiser.json; the rest is the feature text as math.
import { classColumns, classFormula, classScope, findFeature, resourceMax, type ClassContext } from './classes';
import { evaluateNumber } from './expr';
import type { AbilityScores, ClassEntry, Derived } from './types';

/** Scrapper column: d4 L1–4, d6 5–8, d8 9–12, d10 13–16, d12 17–20 — p85. */
export function scrapperDie(cls: ClassEntry, level: number): string {
  return String(classColumns(cls, level).scrapperDie);
}

/** Fury Points column; 0 at level 1 — p85–86. */
export function furyPoints(ctx: ClassContext): number {
  return resourceMax(ctx, 'fury');
}

/** Fury features known = proficiency bonus — p86. */
export function furyFeaturesKnown(ctx: ClassContext): number {
  const count = findFeature(ctx.cls, 'Fury').choices?.count ?? 0;
  return evaluateNumber(count, classScope(ctx));
}

/** 8 + proficiency bonus + Constitution modifier — p86. */
export function furySaveDc(ctx: ClassContext): Derived {
  return { ...classFormula(ctx, 'furyDC'), page: 86 };
}

/** Proficiency-bonus uses per long rest; while frenzied, + proficiency bonus melee damage — p86. */
export function thrillOfTheFight(ctx: ClassContext): { uses: number; damageBonus: number } {
  return { uses: resourceMax(ctx, 'thrill'), damageBonus: Number(classScope(ctx).prof) };
}

export interface DieRoll {
  count: number;
  die: string;
  bonus: number;
  /** "1d6 + 7" */
  text: string;
}

function roll(count: number, die: string, bonus = 0): DieRoll {
  return { count, die, bonus, text: `${count}${die}${bonus ? ` + ${bonus}` : ''}` };
}

/** Temporary hit points = Scrapper die + bruiser level (Brace for Impact p86, Blood for Brawn p87). */
export function scrapperTempHp(cls: ClassEntry, level: number): DieRoll {
  return roll(1, scrapperDie(cls, level), level);
}

/** Persuasion bonus when truthful about motives: bruiser level / 4, rounded up — p87. */
export function enduringHonestyBonus(level: number): number {
  return Math.ceil(level / 4);
}

/** Blood for Brawn can trigger at half hit point maximum or less — p87. */
export function bloodForBrawnThreshold(maxHp: number): number {
  return Math.floor(maxHp / 2);
}

/** Con save DC 10, +5 for each use since the last rest — p87. */
export function undyingFrenzyDc(usesSinceRest: number): number {
  return 10 + 5 * usesSinceRest;
}

/** Black Fist: damage reduction = Con mod, or + half Con mod (rounded up) to hit and + Con mod damage — p89. */
export function armamentCoatedMuscles(conMod: number): { damageReduction: number; attackBonus: number; damageBonus: number } {
  return { damageReduction: conMod, attackBonus: Math.ceil(conMod / 2), damageBonus: conMod };
}

/** Hasshoken: half proficiency bonus (rounded up) d6 thunder — p91. */
export function internalVibrations(prof: number): DieRoll {
  return roll(Math.ceil(prof / 2), 'd6');
}

/** Applies a feature's ability increases, each limited by its own cap (The King: +2 Str and Con, cap 22 — p87). */
export function applyAbilityIncreases(scores: AbilityScores, cls: ClassEntry, featureName: string): AbilityScores {
  const out = { ...scores };
  for (const effect of findFeature(cls, featureName).effects ?? []) {
    if (effect.type !== 'ability' || !effect.ability) continue;
    const raised = out[effect.ability] + (effect.value ?? 0);
    out[effect.ability] = Math.max(out[effect.ability], Math.min(raised, effect.max ?? raised));
  }
  return out;
}
