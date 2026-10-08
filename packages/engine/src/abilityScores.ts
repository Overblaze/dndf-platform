// The three ways to set a character's starting ability scores.
// Rolling and the standard array are the handbook's own (EH10 p.10, EH8.8 p.10, "Step 7: Determine
// Ability Scores"). Point buy is the usual 5e variant: the handbooks do not print it, so its numbers
// are campaign-wide constants here.
import { rollDie, type Rng } from './dice';
import { ABILITIES, type Ability, type AbilityScores, type BreakdownLine } from './types';

export type ScoreMethod = 'manual' | 'array' | 'pointBuy' | 'roll';

/** "15, 14, 13, 12, 10, 8" — EH10 p.10. */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export const POINT_BUY = {
  budget: 27,
  min: 8,
  max: 15,
  /** What each score costs: one point a step up to 13, two a step above it. */
  cost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } as Record<number, number>,
};

export interface PointBuy {
  spent: number;
  remaining: number;
  lines: BreakdownLine[];
  /** What a strict reading would object to. Shown, never enforced. */
  warnings: string[];
}

/** The cost of a set of scores under point buy, line by line. A score outside 8–15 has no price and is warned about. */
export function pointBuy(scores: AbilityScores): PointBuy {
  const lines: BreakdownLine[] = [];
  const warnings: string[] = [];
  let spent = 0;
  for (const ability of ABILITIES) {
    const score = scores[ability];
    const cost = POINT_BUY.cost[score];
    if (cost === undefined) {
      warnings.push(`${ability.toUpperCase()} ${score} is outside ${POINT_BUY.min}–${POINT_BUY.max}, so point buy has no price for it.`);
      lines.push({ label: `${ability.toUpperCase()} ${score}`, value: 0 });
      continue;
    }
    spent += cost;
    lines.push({ label: `${ability.toUpperCase()} ${score}`, value: cost });
  }
  if (spent > POINT_BUY.budget) warnings.push(`${spent} points spent: ${spent - POINT_BUY.budget} more than the ${POINT_BUY.budget} point buy gives.`);
  return { spent, remaining: POINT_BUY.budget - spent, lines, warnings };
}

export interface ScoreRoll {
  /** The four dice, in the order rolled. */
  dice: number[];
  /** Position in `dice` of the one left out (the first of the lowest). */
  dropped: number;
  total: number;
}

/** "Roll four 6-sided dice and record the total of the highest three" — EH10 p.10. */
export function rollScore(rng: Rng): ScoreRoll {
  const dice = [rollDie(6, rng), rollDie(6, rng), rollDie(6, rng), rollDie(6, rng)];
  const dropped = dice.indexOf(Math.min(...dice));
  return { dice, dropped, total: dice.reduce((sum, d) => sum + d, 0) - dice[dropped]! };
}

/** "Do this five more times, so that you have six numbers." */
export function rollScores(rng: Rng): ScoreRoll[] {
  return Array.from({ length: 6 }, () => rollScore(rng));
}

/** Which number of a pool (the array, or six rolls) each ability has been given; null until it has one. */
export type Assignment = Record<Ability, number | null>;

export const NO_ASSIGNMENT: Assignment = { str: null, dex: null, con: null, int: null, wis: null, cha: null };

/** Gives `ability` the pool number at `index`. A number already given to another ability swaps with what this one had. */
export function assign(current: Assignment, ability: Ability, index: number | null): Assignment {
  const next = { ...current };
  if (index !== null) {
    const holder = ABILITIES.find((a) => a !== ability && current[a] === index);
    if (holder) next[holder] = current[ability];
  }
  next[ability] = index;
  return next;
}

/** The scores a pool gives once assigned. An ability with nothing assigned keeps `fallback`. */
export function assignedScores(pool: readonly number[], assignment: Assignment, fallback: AbilityScores): AbilityScores {
  const out = { ...fallback };
  for (const ability of ABILITIES) {
    const index = assignment[ability];
    if (index !== null && pool[index] !== undefined) out[ability] = pool[index]!;
  }
  return out;
}

/** How a character's starting scores were set, kept so the form can open on the same choices. */
export interface ScoreOrigin {
  method: ScoreMethod;
  /** The scores the method gave, before anything is added. */
  base: AbilityScores;
  /** What race, improvements and feats add to each. */
  bonus: AbilityScores;
  /** The pool for the array or the rolls, and which number each ability took. */
  pool?: number[];
  assignment?: Assignment;
  /** The dice behind each rolled number. */
  rolls?: ScoreRoll[];
}

/** Base plus bonus for every ability: the scores the sheet uses. */
export function finalScores(base: AbilityScores, bonus: AbilityScores): AbilityScores {
  const out = { ...base };
  for (const ability of ABILITIES) out[ability] = base[ability] + (bonus[ability] ?? 0);
  return out;
}
