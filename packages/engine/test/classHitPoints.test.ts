import { describe, expect, it } from 'vitest';
import { applyLevelUp, deriveSheet, levelUpPlan, newCharacter, printedFixedHp, type ClassEntry } from '../src';
import { loadRules } from './load';

// The book's own hit point lines, on every class, agree with what the sheet works out.
describe.each(['dndf-10', 'dndf-8.8'] as const)('class hit points as the book prints them (%s)', (version) => {
  const rules = loadRules(version);
  const classes = [...rules.values()].filter((e): e is ClassEntry => e.kind === 'class');
  const scores = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };

  it('every class carries its three lines, and they say what its hit die says', () => {
    expect(classes.length).toBeGreaterThanOrEqual(13);
    for (const cls of classes) {
      const lines = cls.hitPoints!;
      expect(lines, cls.name).toBeTruthy();
      expect(lines.hitDice, cls.name).toMatch(new RegExp(`^1d${cls.hitDie} per `));
      // Level 1: the die's maximum plus Constitution.
      expect(lines.atFirstLevel, cls.name).toBe(`${cls.hitDie} + your Constitution modifier`);
      // After that: the die rolled, or the fixed number, which is the average the sheet uses.
      expect(lines.atHigherLevels, cls.name).toMatch(new RegExp(`^1d${cls.hitDie} \\(or \\d+\\) \\+ your Constitution modifier per .+ level after 1st$`));
    }
    // One class's printed number is not its die's average: the Chemist's "1d8 (or 6)", in both handbooks.
    // The sheet keeps the die's average (5) and the level-up dialog says so; nothing else may differ unnoticed.
    const differing = classes.filter((cls) => printedFixedHp(cls) !== cls.hitDie / 2 + 1).map((cls) => [cls.name, cls.hitDie, printedFixedHp(cls)]);
    expect(differing).toEqual([['Chemist', 8, 6]]);
  });

  it('a level-1 character of every class starts on the die’s maximum plus Constitution, at full hit points', () => {
    for (const cls of classes) {
      const first = Number(/^(\d+) \+/.exec(cls.hitPoints!.atFirstLevel!)![1]);
      const doc = newCharacter({ name: 'T', rulesVersion: version, classId: cls.id, level: 1, scores }, rules);
      const sheet = deriveSheet(doc, rules);
      expect(sheet.maxHp.value, cls.name).toBe(first + 2);
      expect(sheet.maxHp.lines[0], cls.name).toEqual({ label: `Level 1: d${cls.hitDie} maximum`, value: cls.hitDie });
      expect(doc.state.hp, cls.name).toBe(first + 2);
    }
  });

  it('each later level adds the fixed number, or what was rolled, plus Constitution; only the very first level is the maximum', () => {
    for (const cls of classes) {
      // The die's average, which is the number the book prints for every class but the Chemist.
      const fixed = cls.hitDie / 2 + 1;
      expect(levelUpPlan(newCharacter({ name: 'T', rulesVersion: version, classId: cls.id, level: 1, scores }, rules), rules, cls.id).bookFixedHp, cls.name).toBe(cls.name === 'Chemist' ? 6 : undefined);
      const one = newCharacter({ name: 'T', rulesVersion: version, classId: cls.id, level: 1, scores }, rules);
      const start = deriveSheet(one, rules).maxHp.value;
      const averaged = applyLevelUp(one, rules, { classId: cls.id, hpRoll: null });
      expect(averaged.hpGained, cls.name).toBe(fixed + 2);
      expect(deriveSheet(averaged.doc, rules).maxHp.value, cls.name).toBe(start + fixed + 2);
      const rolledOne = applyLevelUp(one, rules, { classId: cls.id, hpRoll: 1 });
      expect(deriveSheet(rolledOne.doc, rules).maxHp.value, cls.name).toBe(start + 1 + 2);
      expect(levelUpPlan(one, rules, cls.id).hitPointsRule, cls.name).toBe(cls.hitPoints!.atHigherLevels);
      // A second class is not a first level: its first level there is rolled or fixed, never the maximum.
      const other = classes.find((c) => c.id !== cls.id)!;
      const multi = applyLevelUp(one, rules, { classId: other.id, hpRoll: null });
      expect(deriveSheet(multi.doc, rules).maxHp.value, `${cls.name} + ${other.name}`).toBe(start + other.hitDie / 2 + 1 + 2);
    }
  });
});
