// Gaining a level: the plan read from the class table, and the character after taking it.
import { describe, expect, it } from 'vitest';
import { applyLevelUp, deriveSheet, levelUpPlan, newCharacter, type AbilityScores, type CharacterDoc, type RulesVersion } from '../src';
import { loadRules } from './load';

const V10 = 'dndf-10' as RulesVersion;
const base: AbilityScores = { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 };
const make = (classId: string, level: number, scores: Partial<AbilityScores> = {}, version: RulesVersion = V10, more: Partial<CharacterDoc> = {}) => {
  const rules = loadRules(version);
  const doc = { ...newCharacter({ name: 'T', rulesVersion: version, classId, level, scores: { ...base, ...scores } }, rules), ...more };
  return { doc: { ...doc, state: { ...doc.state, hp: deriveSheet(doc, rules).maxHp.value } }, rules };
};

describe('the plan for the next level', () => {
  it('Warrior 2 → 3: asks for the Warrior Type, lists the 3rd-level feature, d10 averaging 6', () => {
    const { doc, rules } = make('class.warrior', 2);
    const plan = levelUpPlan(doc, rules, 'class.warrior');
    expect(plan).toMatchObject({ className: 'Warrior', classLevel: 3, totalLevel: 3, hitDie: 10, averageHp: 6, conMod: 2, improvement: false, newClass: false });
    expect(plan.subclass!.label).toBe('Warrior Type');
    expect(plan.subclass!.options.length).toBeGreaterThan(3);
    expect(plan.features.map((f) => f.name)).toContain('Warrior Type');
    expect(plan.features.every((f) => f.from === 'Warrior 3')).toBe(true);
    expect(plan.warnings).toEqual([]);
  });

  it('Warrior 3 → 4 is an Ability Score Improvement; 4 → 5 raises proficiency +2 → +3 and brings Extra Attack', () => {
    const four = levelUpPlan(make('class.warrior', 3).doc, loadRules(V10), 'class.warrior');
    expect(four.improvement).toBe(true);
    expect(four.proficiency).toEqual({ from: 2, to: 2 });
    const five = levelUpPlan(make('class.warrior', 4).doc, loadRules(V10), 'class.warrior');
    expect(five.improvement).toBe(false);
    expect(five.proficiency).toEqual({ from: 2, to: 3 });
    expect(five.features.map((f) => f.name)).toContain('Extra Attack');
  });

  it('Martial Artist 4 → 5: the table’s Martial Arts die 1d6 → 1d8 and ki 4 → 5', () => {
    const plan = levelUpPlan(make('class.martial_artist', 4).doc, loadRules(V10), 'class.martial_artist');
    expect(plan.columns).toContainEqual({ key: 'martialArtsDie', from: '1d6', to: '1d8' });
    expect(plan.columns).toContainEqual({ key: 'ki', from: 4, to: 5 });
    expect(plan.columns.find((c) => c.key === 'unarmoredMovement')).toBeUndefined(); // 10 ft. at both levels
  });

  it('a subclass feature arrives at its level; a chosen subclass is not asked for again', () => {
    const { doc, rules } = make('class.warrior', 6);
    const withType = { ...doc, classes: [{ ...doc.classes[0]!, subclass: 'subclass.warrior.ryuo_samurai' }] };
    const plan = levelUpPlan(withType, rules, 'class.warrior');
    expect(plan.subclass).toBeUndefined();
    expect(plan.features.map((f) => f.from)).toContain('Ryuo Samurai 7');
  });

  it('option lists with room: a Bruiser reaching 2nd level has Fury features to pick', () => {
    const { doc, rules } = make('class.bruiser', 1);
    const plan = levelUpPlan(doc, rules, 'class.bruiser');
    const fury = plan.choices.find((c) => c.id === 'furyFeatures')!;
    expect(fury.allowed).toBeGreaterThan(0);
    expect(fury.have).toEqual([]);
    expect(fury.options.length).toBeGreaterThan(3);
  });

  it('a first level in another class warns when the handbook’s prerequisite is not met, and still plans it', () => {
    const { doc, rules } = make('class.warrior', 3, { int: 8, wis: 8, cha: 8, dex: 8 });
    const plan = levelUpPlan(doc, rules, 'class.priest');
    expect(plan).toMatchObject({ newClass: true, classLevel: 1, totalLevel: 4 });
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(levelUpPlan(make('class.warrior', 3, { wis: 16 }).doc, rules, 'class.priest').warnings.filter((w) => /Priest/.test(w))).toEqual([]);
  });
});

describe('taking the level', () => {
  it('average hit points: Warrior 4 → 5 gains 6 + Con 2 = 8; the maximum rises by the same', () => {
    const { doc, rules } = make('class.warrior', 4);
    const before = deriveSheet(doc, rules).maxHp.value; // 10 + 3 × 6 + 2 × 4 = 36
    expect(before).toBe(36);
    const taken = applyLevelUp(doc, rules, { classId: 'class.warrior', hpRoll: null });
    expect(taken.hpGained).toBe(8);
    expect(taken.doc.classes[0]!.level).toBe(5);
    expect(deriveSheet(taken.doc, rules).maxHp.value).toBe(44);
    expect(taken.doc.state.hp).toBe(44);
    expect(taken.summary).toBe('Level up: Warrior 5, +8 hit points');
  });

  it('a rolled hit die is kept for that level: rolling 9 gains 9 + 2 = 11, and wounds stay wounds', () => {
    const { doc, rules } = make('class.warrior', 4);
    const hurt = { ...doc, state: { ...doc.state, hp: 10 } };
    const taken = applyLevelUp(hurt, rules, { classId: 'class.warrior', hpRoll: 9 });
    expect(taken.hpGained).toBe(11);
    expect(taken.doc.classes[0]!.hpRolls).toEqual([null, null, null, 9]);
    expect(deriveSheet(taken.doc, rules).maxHp.value).toBe(36 + 11);
    expect(taken.doc.state.hp).toBe(21);
    expect(taken.summary).toContain('(rolled 9)');
  });

  it('an improvement to Constitution 14 → 16 adds one hit point for every level, old and new', () => {
    const { doc, rules } = make('class.warrior', 3); // 10 + 2 × 6 + 2 × 3 = 28
    const taken = applyLevelUp(doc, rules, { classId: 'class.warrior', hpRoll: null, scoreIncrease: { con: 2 } });
    expect(taken.doc.scores.con).toBe(16);
    expect(taken.hpGained).toBe(6 + 3 + 3); // the die, the new modifier, and +1 for each of the three earlier levels
    expect(deriveSheet(taken.doc, rules).maxHp.value).toBe(28 + 12);
    expect(taken.doc.state.hp).toBe(40);
    expect(taken.summary).toContain('CON +2');
  });

  it('+1 to two scores, or a feat instead; the subclass and option picks are set', () => {
    const { doc, rules } = make('class.warrior', 3);
    const two = applyLevelUp(doc, rules, { classId: 'class.warrior', hpRoll: null, scoreIncrease: { str: 1, dex: 1 } }).doc;
    expect([two.scores.str, two.scores.dex]).toEqual([17, 13]);
    const feat = [...rules.values()].find((e) => e.kind === 'feat' && e.name === 'Tough')!;
    const tough = applyLevelUp(doc, rules, { classId: 'class.warrior', hpRoll: null, feat: feat.id });
    expect(tough.doc.feats).toEqual([feat.id]);
    expect(deriveSheet(tough.doc, rules).maxHp.value).toBe(28 + 8 + 8); // the level, and Tough's 2 per level over four levels
    const typed = applyLevelUp(make('class.warrior', 2).doc, rules, { classId: 'class.warrior', hpRoll: null, subclass: 'subclass.warrior.ryuo_samurai' }).doc;
    expect(typed.classes[0]!.subclass).toBe('subclass.warrior.ryuo_samurai');
    const bruiser = make('class.bruiser', 1);
    const picked = applyLevelUp(bruiser.doc, bruiser.rules, { classId: 'class.bruiser', hpRoll: null, choices: { furyFeatures: ['keep_going'] } }).doc;
    expect(picked.choices.furyFeatures).toEqual(['keep_going']);
    expect(deriveSheet(picked, bruiser.rules).warnings).toEqual([]);
  });

  it('a first level in a second class: its die averaged, no first-level maximum; hit dice pool gains the die', () => {
    const { doc, rules } = make('class.warrior', 3, { wis: 16 });
    const taken = applyLevelUp(doc, rules, { classId: 'class.priest', hpRoll: null });
    expect(taken.doc.classes.map((c) => [c.id, c.level])).toEqual([['class.warrior', 3], ['class.priest', 1]]);
    expect(taken.hpGained).toBe(5 + 2); // d8 average 5, Con 2
    const sheet = deriveSheet(taken.doc, rules);
    expect(sheet.maxHp.value).toBe(28 + 7);
    expect(sheet.level).toBe(4);
    expect(sheet.hitDice.pool.map((p) => `${p.count}d${p.die}`).sort()).toEqual(['1d8', '3d10']);
  });

  it('scores set by point buy keep their method: the increase goes in the bonus column', () => {
    const origin = { method: 'pointBuy' as const, base: { ...base }, bonus: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } };
    const { doc, rules } = make('class.warrior', 3, {}, V10, { scoreOrigin: origin });
    const taken = applyLevelUp(doc, rules, { classId: 'class.warrior', hpRoll: null, scoreIncrease: { str: 2 } }).doc;
    expect(taken.scores.str).toBe(18);
    expect(taken.scoreOrigin).toMatchObject({ method: 'pointBuy', base: { str: 16 }, bonus: { str: 2 } });
  });

  it.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('every class can be levelled from 1 to 20, one level at a time, and matches a character built at that level (%s)', (version) => {
    const rules = loadRules(version);
    for (const cls of [...rules.values()].filter((e) => e.kind === 'class')) {
      let doc = make(cls.id, 1, {}, version).doc;
      for (let level = 2; level <= 20; level++) {
        const plan = levelUpPlan(doc, rules, cls.id);
        expect(plan.classLevel, cls.name).toBe(level);
        doc = applyLevelUp(doc, rules, { classId: cls.id, hpRoll: null }).doc;
        const built = make(cls.id, level, {}, version).doc;
        expect(deriveSheet(doc, rules).maxHp.value, `${cls.name} ${level}`).toBe(deriveSheet(built, rules).maxHp.value);
        expect(doc.state.hp, `${cls.name} ${level}`).toBe(deriveSheet(doc, rules).maxHp.value);
      }
    }
  });
});
