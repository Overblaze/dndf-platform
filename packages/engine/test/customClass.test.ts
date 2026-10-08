// A class the player wrote behaves like one from the handbook: hit dice, saves, proficiencies,
// features by level, level-up and multiclassing.
import { describe, expect, it } from 'vitest';
import { applyLevelUp, customClassId, deriveSheet, levelUpPlan, newCharacter, normalizeDoc, rulesFor, type AbilityScores, type CharacterDoc, type CustomClass, type RulesVersion } from '../src';
import { loadRules } from './load';

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const navigator: CustomClass = {
  id: 'nav', name: 'Navigator', hitDie: 8, savingThrows: ['int', 'wis'], armor: ['light', 'shields'], weapons: ['simple', 'rapier'], tools: ['Navigator’s tools'],
  asiLevels: [4, 8, 12, 16, 19],
  features: [
    { id: 'f1', level: 1, name: 'Read the Winds', text: 'You always know which way is north.', uses: { max: 2, recharge: 'short' }, action: 'bonus' },
    { id: 'f2', level: 3, name: 'Sea Sense', text: 'You are hard to surprise at sea.', bonuses: [{ type: 'initiative', value: 2 }] },
    { id: 'f3', level: 5, name: 'Storm Step', text: 'Lightning quickens you.', switched: true, bonuses: [{ type: 'speed', value: 10 }], note: 'Resistance to lightning damage' },
  ],
};

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('a custom class (%s)', (version) => {
  const handbook = loadRules(version);
  const make = (level: number, more: Partial<CharacterDoc> = {}) => {
    const seed = { customClasses: [navigator], rulesVersion: version };
    const doc = { ...newCharacter({ name: 'T', rulesVersion: version, classId: customClassId('nav'), level, scores }, rulesFor(seed, handbook)), customClasses: [navigator], ...more };
    return { doc: { ...doc, state: { ...doc.state, hp: deriveSheet(doc, handbook).maxHp.value } }, sheet: deriveSheet(doc, handbook) };
  };

  it('hit points from its d8: level 5 is 8 + 4 × 5 + Con 2 × 5 = 38, with five d8 hit dice', () => {
    const { sheet } = make(5);
    expect(sheet.maxHp.value).toBe(38);
    expect(sheet.hitDice.pool).toEqual([expect.objectContaining({ die: 8, count: 5 })]);
    expect(sheet.summary).toContain('Navigator 5');
    expect(sheet.warnings).toEqual([]);
  });

  it('its saving throws and proficiencies: Int and Wis saves, light armor, shields, simple weapons and rapiers', () => {
    const { sheet } = make(1);
    expect([sheet.saves.int.proficient, sheet.saves.wis.proficient, sheet.saves.str.proficient]).toEqual([true, true, false]);
    expect(sheet.saves.wis.value).toBe(1 + 2);
    expect(sheet.proficiencies.armor.map((p) => p.id).sort()).toEqual(['light', 'shields']);
    expect(sheet.proficiencies.weapons.map((p) => p.id).sort()).toEqual(['rapier', 'simple']);
    expect(sheet.proficiencies.tools.map((p) => p.name)).toEqual(['Navigator’s tools']);
    expect(sheet.proficiencies.armor[0]!.from).toBe('Navigator');
  });

  it('features arrive at their level with their counters, numbers and switches', () => {
    const one = make(1).sheet;
    expect(one.features.map((f) => f.name)).toContain('Read the Winds');
    expect(one.features.map((f) => f.name)).not.toContain('Sea Sense');
    expect(one.resources.find((r) => r.name === 'Read the Winds')).toMatchObject({ max: 2, recharge: 'short' });
    expect(one.features.find((f) => f.name === 'Read the Winds')).toMatchObject({ from: 'Navigator 1', book: 'Custom', action: 'bonus' });
    expect(make(3).sheet.initiative.value).toBe(one.initiative.value + 2);
    const five = make(5);
    expect(five.sheet.toggles.map((t) => t.label)).toContain('Storm Step');
    const on = deriveSheet({ ...five.doc, state: { ...five.doc.state, toggles: { 'custom.nav.f3': true } } }, handbook);
    expect(on.speed.value).toBe(five.sheet.speed.value + 10);
    expect(on.notes.map((n) => n.label)).toContain('Resistance to lightning damage');
  });

  it('levels up like any class: the plan lists the level’s feature and improvement, and hit points follow the d8', () => {
    const { doc } = make(2);
    const plan = levelUpPlan(doc, handbook, customClassId('nav'));
    expect(plan).toMatchObject({ className: 'Navigator', classLevel: 3, hitDie: 8, averageHp: 5, improvement: false });
    expect(plan.features.map((f) => f.name)).toEqual(['Sea Sense']);
    const three = applyLevelUp(doc, handbook, { classId: customClassId('nav'), hpRoll: null });
    expect(three.hpGained).toBe(5 + 2);
    expect(levelUpPlan(three.doc, handbook, customClassId('nav')).improvement).toBe(true);
  });

  it('multiclasses with a handbook class: Warrior 3 / Navigator 2 has 3d10 + 2d8 and both classes’ features', () => {
    const base = newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level: 3, scores }, handbook);
    const doc = { ...base, customClasses: [navigator], classes: [...base.classes, { id: customClassId('nav'), level: 2 }] };
    const sheet = deriveSheet(doc, handbook);
    expect(sheet.level).toBe(5);
    expect(sheet.maxHp.value).toBe(10 + 2 * 6 + 2 * 5 + 2 * 5); // d10 first level, two more at 6, two d8 levels at 5, Con 2 × 5
    expect(sheet.hitDice.pool.map((p) => `${p.count}d${p.die}`).sort()).toEqual(['2d8', '3d10']);
    expect(sheet.features.map((f) => f.name)).toEqual(expect.arrayContaining(['Second Wind', 'Read the Winds']));
    expect(sheet.saves.int.proficient).toBe(false); // saving throws come from the first class only
  });

  it('survives saving and loading, and a custom class that has gone missing warns without breaking the sheet', () => {
    const { doc } = make(3);
    expect(normalizeDoc(JSON.parse(JSON.stringify(doc)))!.customClasses).toEqual([navigator]);
    const orphan = deriveSheet({ ...doc, customClasses: [] }, handbook);
    expect(orphan.warnings).toEqual([`Class "class.custom.nav" is not in the ${version} rules data.`]);
  });
});
