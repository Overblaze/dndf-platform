// Class features that only showed text until now: what they cost, what they roll and what they
// leave on the sheet (docs/FORMULAS.md, "Class features that spend a pool").
import { describe, expect, it } from 'vitest';
import { activateFeature, deriveSheet, newCharacter, type AbilityScores, type RulesVersion, type Sheet } from '../src';
import { loadRules } from './load';

const V10 = 'dndf-10' as RulesVersion;
const V88 = 'dndf-8.8' as RulesVersion;
const BOTH = [V10, V88];
const base: AbilityScores = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name)!;
const notes = (sheet: Sheet) => sheet.notes.map((n) => n.label);

function build(version: RulesVersion, classId: string, level: number, scores: Partial<AbilityScores> = {}, on: string[] = []) {
  const rules = loadRules(version);
  const doc = newCharacter({ name: 'Test', rulesVersion: version, classId, level, scores: { ...base, ...scores } }, rules);
  const switched = { ...doc, state: { ...doc.state, toggles: Object.fromEntries(on.map((id) => [id, true])) } };
  return { doc: switched, sheet: deriveSheet(switched, rules), rules };
}

describe.each(BOTH)('Martial Artist chakras (%s)', (version) => {
  it('each chakra spends its ki: Ki-Fueled Attack 1, Heart 2, Crown 1, Third Eye 3, Death 4', () => {
    const { sheet } = build(version, 'class.martial_artist', 20);
    expect(['Ki-Fueled Attack', 'Heart Chakra', 'Crown Chakra', 'Third Eye Chakra', 'Death Chakra'].map((n) => feature(sheet, n).cost)).toEqual(
      [{ ki: 1 }, { ki: 2 }, { ki: 1 }, { ki: 3 }, { ki: 4 }]);
  });

  it('Heart Chakra heals a Martial Arts die + proficiency and takes 2 ki from the pool', () => {
    const { doc, sheet, rules } = build(version, 'class.martial_artist', 4);
    const heart = feature(sheet, 'Heart Chakra');
    expect(heart.rolls[0]).toMatchObject({ kind: 'heal' });
    expect(heart.rolls[0]!.dice).toMatch(/^1d\d+ \+ 2$/); // the class table's die at 4th level, + prof 2
    const ki = sheet.resources.find((r) => r.id === 'ki')!;
    const after = deriveSheet({ ...doc, state: activateFeature(doc.state, sheet, heart).state }, rules).resources.find((r) => r.id === 'ki')!;
    expect(after.remaining).toBe(ki.remaining - 2);
  });

  it('Crown Chakra at 14th: proficient in every saving throw → Int save 0 + prof 5', () => {
    expect(build(version, 'class.martial_artist', 13).sheet.saves.int.value).toBe(0);
    const { sheet } = build(version, 'class.martial_artist', 14);
    expect(Object.values(sheet.saves).every((s) => s.proficient)).toBe(true);
    expect(sheet.saves.int.value).toBe(5);
  });

  it('Death Chakra rolls four Martial Arts dice; Third Eye Chakra is a switch for its resistance', () => {
    const { sheet } = build(version, 'class.martial_artist', 20);
    expect(feature(sheet, 'Death Chakra').rolls[0]!.dice).toMatch(/^4d\d+$/);
    expect(notes(sheet)).not.toContain('Resistance to all damage except force');
    expect(notes(build(version, 'class.martial_artist', 20, {}, ['third_eye_chakra']).sheet)).toContain('Resistance to all damage except force');
  });
});

describe.each(BOTH)('Hybrid Point spends (%s)', (version) => {
  it('Power Enhancements 1, Flash Augment 2, Resilience Augment 1, Chain Channeling 2', () => {
    const { sheet } = build(version, 'class.hybrid', 14);
    expect(['Power Enhancements', 'Flash Augment', 'Resilience Augment', 'Chain Channeling'].map((n) => feature(sheet, n).cost?.hybrid_points)).toEqual([1, 2, 1, 2]);
    expect(feature(sheet, 'Flash Augment').action).toBe('bonus');
    expect(notes(sheet)).toContain('Finishing a short or long rest: regain 4 Hybrid Points');
  });
});

describe.each(BOTH)('Conqueror, Priest, Oracle (%s)', (version) => {
  it('Conqueror’s Command and Empower Conqueror’s Haki each spend a Leadership Die and roll it', () => {
    const { sheet } = build(version, 'class.conqueror', 9);
    for (const name of ['Conqueror’s Command', 'Empower Conqueror’s Haki']) {
      expect(feature(sheet, name).cost).toEqual({ leadership: 1 });
      expect(feature(sheet, name).rolls[0]!.dice).toMatch(/^1d\d+$/);
    }
  });

  it('Priest Kami’s Will lists its immunities from 3rd; Oracle Enhanced Divination is once per long rest', () => {
    expect(notes(build(version, 'class.priest', 3).sheet)).toContain('Immune to the disease and poisoned conditions; resistance to poison damage');
    expect(notes(build(version, 'class.priest', 2).sheet)).toHaveLength(0);
    expect(build(version, 'class.oracle', 7).sheet.resources.find((r) => r.name === 'Enhanced Divination')).toMatchObject({ max: 1, recharge: 'long' });
  });
});

describe('Empowering Melody, Reliable Talent, Fast Talker', () => {
  it.each([[V10, 'class.virtuoso'], [V88, 'class.skald']] as const)('Empowering Melody: +1 at 5th, +2 at 8th, +3 at 14th to hit and damage with the harmonic weapon (%s %s)', (version, classId) => {
    const hit = (level: number, on: string[]) => build(version, classId, level, {}, on).sheet.attacks[0]!.toHit.value;
    expect([5, 8, 14].map((level) => hit(level, ['harmonic_weapon']) - hit(level, []))).toEqual([1, 2, 3]);
    expect(feature(build(version, classId, 8).sheet, 'Empowering Melody').displays).toEqual([{ label: 'Added to spell damage and healing rolls', value: '2' }]);
  });

  it('Fast Talker adds 1d4 for the v10 Renegade and makes 9 or lower a 10 for the v8.8 Rogue; both get Reliable Talent at 11th', () => {
    expect(feature(build(V10, 'class.renegade', 2).sheet, 'Fast Talker').rolls[0]!.dice).toBe('1d4');
    expect(notes(build(V88, 'class.rogue', 3).sheet)).toContain('Persuasion and Deception checks: treat a d20 roll of 9 or lower as a 10');
    for (const [version, classId] of [[V10, 'class.renegade'], [V88, 'class.rogue']] as const) {
      expect(notes(build(version, classId, 11).sheet).some((n) => n.startsWith('Ability checks that add your proficiency bonus'))).toBe(true);
      expect(notes(build(version, classId, 10).sheet).some((n) => n.startsWith('Ability checks that add your proficiency bonus'))).toBe(false);
    }
  });
});

describe('Warrior fighting styles that were text only', () => {
  it.each(['dndf-10', 'dndf-8.8'] as const)('Dueling: +2 damage with a one-handed melee weapon, not a two-handed one, a ranged one or a fist (%s)', (version) => {
    const rules = loadRules(version);
    const weapons = [
      { id: 'a', name: 'Longsword', damage: '1d8', damageType: 'slashing', category: 'martial' as const },
      { id: 'b', name: 'Greatsword', damage: '2d6', damageType: 'slashing', category: 'martial' as const, twoHanded: true },
      { id: 'c', name: 'Longbow', damage: '1d8', damageType: 'piercing', category: 'martial' as const, ranged: true, twoHanded: true },
    ];
    const base = { ...newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level: 3, scores: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, rules), weapons };
    const damage = (choices: string[]) => deriveSheet({ ...base, choices: { fightingStyle: choices } }, rules).attacks.map((a) => a.damage);
    const plain = damage([]);
    const dueling = damage(['dueling']);
    expect(dueling[1]).toBe(plain[1]!.replace('+ 3', '+ 5'));
    expect([dueling[0], dueling[2], dueling[3]]).toEqual([plain[0], plain[2], plain[3]]);
    const thrown = deriveSheet({ ...base, choices: { fightingStyle: ['thrown_weapon_fighting'] } }, rules);
    expect(thrown.notes.map((n) => n.label)).toContain('+2 damage on a ranged attack with a thrown weapon');
  });

  it('emanations that let you cast a spell once per long rest have a counter', () => {
    const group = loadRules('dndf-8.8').get('optionGroup.devilforged_sea_devils_emanations')!;
    const uses = Object.fromEntries((group.options as { name: string; uses?: unknown }[]).map((o) => [o.name, o.uses]));
    for (const name of ['Shadow Puppets', 'Trickster’s Escape', 'Wrathful Weapon', 'Reinforced Armor', 'Reactive Armor']) expect(uses[name], name).toEqual({ max: 1, recharge: 'long' });
  });
});
