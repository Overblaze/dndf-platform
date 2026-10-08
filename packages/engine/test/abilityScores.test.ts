// Starting ability scores: the handbook's roll and standard array (EH10 p.10), and 5e point buy.
import { describe, expect, it } from 'vitest';
import { NO_ASSIGNMENT, POINT_BUY, STANDARD_ARRAY, assign, assignedScores, finalScores, pointBuy, rollScore, rollScores, type AbilityScores } from '../src';
import { loadRules } from './load';

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number): AbilityScores => ({ str, dex, con, int, wis, cha });
/** A die roller that returns the faces given, in order. */
const faces = (...list: number[]) => { let i = 0; return () => (list[i++ % list.length]! - 1) / 6 + 0.01; };

describe('standard array', () => {
  it('is the six numbers the handbook prints, in both handbooks', () => {
    expect([...STANDARD_ARRAY]).toEqual([15, 14, 13, 12, 10, 8]);
    for (const version of ['dndf-10', 'dndf-8.8'] as const) {
      const step = (loadRules(version).get('rule.character_creation_guide')!.sections as { name: string; text: string }[]).find((s) => s.name.startsWith('Step 7'))!;
      expect(step.text).toContain('15, 14, 13, 12, 10, 8');
    }
  });

  it('each number goes to one ability; giving a taken number swaps the two', () => {
    let a = assign(NO_ASSIGNMENT, 'str', 0);
    a = assign(a, 'dex', 1);
    expect(assignedScores(STANDARD_ARRAY, a, scores(10, 10, 10, 10, 10, 10))).toEqual(scores(15, 14, 10, 10, 10, 10));
    a = assign(a, 'dex', 0); // Dexterity takes the 15; Strength gets Dexterity's 14
    expect([a.str, a.dex]).toEqual([1, 0]);
    a = assign(a, 'con', 0); // Constitution takes the 15 from Dexterity, which had nothing to give back but its own slot
    expect([a.dex, a.con]).toEqual([null, 0]);
    expect(assign(a, 'con', null).con).toBeNull();
    const all = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).reduce((acc, ability, i) => assign(acc, ability, i), NO_ASSIGNMENT);
    expect(assignedScores(STANDARD_ARRAY, all, scores(0, 0, 0, 0, 0, 0))).toEqual(scores(15, 14, 13, 12, 10, 8));
  });
});

describe('point buy', () => {
  it('27 points, scores 8 to 15: one point a step to 13, two a step after', () => {
    expect(POINT_BUY).toMatchObject({ budget: 27, min: 8, max: 15 });
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((s) => POINT_BUY.cost[s])).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
  });

  it('the standard array costs exactly 27: 9 + 7 + 5 + 4 + 2 + 0', () => {
    const bought = pointBuy(scores(15, 14, 13, 12, 10, 8));
    expect(bought).toMatchObject({ spent: 27, remaining: 0, warnings: [] });
    expect(bought.lines.map((l) => l.value)).toEqual([9, 7, 5, 4, 2, 0]);
  });

  it('all 8s cost nothing; three 15s and three 8s cost 27; 13 across the board costs 30 and says so', () => {
    expect(pointBuy(scores(8, 8, 8, 8, 8, 8))).toMatchObject({ spent: 0, remaining: 27 });
    expect(pointBuy(scores(15, 15, 15, 8, 8, 8))).toMatchObject({ spent: 27, remaining: 0 });
    const over = pointBuy(scores(13, 13, 13, 13, 13, 13));
    expect(over).toMatchObject({ spent: 30, remaining: -3 });
    expect(over.warnings).toEqual(['30 points spent: 3 more than the 27 point buy gives.']);
  });

  it('a score outside 8–15 has no price: it is warned about, never refused', () => {
    const odd = pointBuy(scores(16, 8, 8, 8, 8, 7));
    expect(odd.spent).toBe(0);
    expect(odd.warnings).toHaveLength(2);
  });
});

describe('rolling 4d6 and dropping the lowest', () => {
  it('6, 5, 4, 1 → 15, leaving out the 1; 3, 3, 3, 3 → 9, leaving out one 3', () => {
    expect(rollScore(faces(6, 5, 4, 1))).toEqual({ dice: [6, 5, 4, 1], dropped: 3, total: 15 });
    expect(rollScore(faces(3, 3, 3, 3))).toEqual({ dice: [3, 3, 3, 3], dropped: 0, total: 9 });
    expect(rollScore(faces(1, 6, 6, 6)).total).toBe(18);
    expect(rollScore(faces(1, 1, 1, 1)).total).toBe(3);
  });

  it('six numbers, each from four dice and between 3 and 18', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let run = 0; run < 200; run++) {
      const rolled = rollScores(rng);
      expect(rolled).toHaveLength(6);
      for (const roll of rolled) {
        expect(roll.dice).toHaveLength(4);
        expect(roll.total).toBe(roll.dice.reduce((a, b) => a + b, 0) - Math.min(...roll.dice));
        expect(roll.total).toBeGreaterThanOrEqual(3);
        expect(roll.total).toBeLessThanOrEqual(18);
      }
    }
  });
});

it('final scores are the method’s numbers plus what race, improvements and feats add', () => {
  expect(finalScores(scores(15, 14, 13, 12, 10, 8), scores(2, 0, 1, 0, 0, 0))).toEqual(scores(17, 14, 14, 12, 10, 8));
});
