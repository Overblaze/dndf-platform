// Dice text ("2d6 + 3", "1d20") parsed and rolled with a supplied random source,
// so the engine stays pure and tests can fix the rolls.
import { evaluate, type ExprScope } from './expr';

/** Returns a number in [0, 1), like Math.random. */
export type Rng = () => number;

export interface DiceTerm {
  count: number;
  sides: number;
  sign: 1 | -1;
}

export interface DiceSpec {
  terms: DiceTerm[];
  bonus: number;
}

export interface DiceResult {
  total: number;
  /** Each die as rolled, in order. */
  rolls: { sides: number; value: number }[];
  bonus: number;
  text: string;
}

/** Replaces each {expression} in a rules template: "1{col.scrapperDie} + {level}" → "1d6 + 7". */
export function fillTemplate(template: string, scope: ExprScope): string {
  // "+ -1" (a negative modifier dropped into "1d10 + {mod}") reads as "- 1".
  return template.replace(/\{([^}]+)\}/g, (_, expr: string) => String(evaluate(expr, scope))).replace(/\+\s*-/g, '- ');
}

/** More dice or bigger dice than these are refused: nothing in the game needs them, and rolling them would stall the app or the bot. */
export const DICE_LIMITS = { dice: 500, sides: 1000, bonus: 1_000_000 };

export function parseDice(text: string): DiceSpec {
  const spec: DiceSpec = { terms: [], bonus: 0 };
  const compact = text.replace(/\s+/g, '');
  const pattern = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gy;
  let consumed = 0;
  for (let m = pattern.exec(compact); m; m = pattern.exec(compact)) {
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      // "1d8 + 1d8" is 2d8: dice of the same size are counted together.
      const term = { count: Number(m[2] || 1), sides: Number(m[3]), sign } as DiceTerm;
      const same = spec.terms.find((t) => t.sides === term.sides && t.sign === term.sign);
      if (same) same.count += term.count;
      else spec.terms.push(term);
    }
    else spec.bonus += sign * Number(m[4]);
    consumed = pattern.lastIndex;
  }
  if (compact === '' || consumed !== compact.length) throw new Error(`Can't read dice "${text.slice(0, 40)}"`);
  const total = spec.terms.reduce((n, t) => n + t.count, 0);
  if (total > DICE_LIMITS.dice) throw new Error(`Can't roll ${total} dice at once (the most is ${DICE_LIMITS.dice})`);
  const odd = spec.terms.find((t) => t.sides < 1 || t.sides > DICE_LIMITS.sides);
  if (odd) throw new Error(`Can't roll a d${odd.sides} (dice have 1 to ${DICE_LIMITS.sides} sides)`);
  if (Math.abs(spec.bonus) > DICE_LIMITS.bonus) throw new Error(`Can't add ${spec.bonus} to a roll`);
  return spec;
}

export function formatDice(spec: DiceSpec): string {
  const dice = spec.terms.map((t, i) => `${t.sign < 0 ? '- ' : i ? '+ ' : ''}${t.count}d${t.sides}`).join(' ');
  if (!spec.bonus) return dice || '0';
  if (!dice) return String(spec.bonus);
  return `${dice} ${spec.bonus < 0 ? '-' : '+'} ${Math.abs(spec.bonus)}`;
}

export function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

export function rollDice(dice: string | DiceSpec, rng: Rng): DiceResult {
  const spec = typeof dice === 'string' ? parseDice(dice) : dice;
  const rolls: DiceResult['rolls'] = [];
  let total = spec.bonus;
  for (const term of spec.terms) {
    for (let i = 0; i < term.count; i++) {
      const value = rollDie(term.sides, rng);
      rolls.push({ sides: term.sides, value });
      total += term.sign * value;
    }
  }
  return { total, rolls, bonus: spec.bonus, text: formatDice(spec) };
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface D20Result {
  /** The die that counts. */
  die: number;
  /** Both dice when rolled with advantage or disadvantage. */
  dice: number[];
  bonus: number;
  total: number;
  mode: RollMode;
  natural20: boolean;
  natural1: boolean;
}

export function rollD20(bonus: number, rng: Rng, mode: RollMode = 'normal'): D20Result {
  const dice = mode === 'normal' ? [rollDie(20, rng)] : [rollDie(20, rng), rollDie(20, rng)];
  const die = mode === 'disadvantage' ? Math.min(...dice) : Math.max(...dice);
  return { die, dice, bonus, total: die + bonus, mode, natural20: die === 20, natural1: die === 1 };
}
