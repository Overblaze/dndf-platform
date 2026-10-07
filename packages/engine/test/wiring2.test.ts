// The numbers the other nine classes add to the sheet (docs/FORMULAS.md), in each handbook that
// has the class. Where the two handbooks print different numbers, both are checked.
import { describe, expect, it } from 'vitest';
import { activateFeature, armorFromItem, deriveSheet, newCharacter, setTracker, weaponFromItem, type AbilityScores, type CharacterDoc, type RulesVersion, type Sheet } from '../src';
import { loadRules } from './load';

const formula = (sheet: Sheet, label: string) => sheet.formulas.find((f) => f.label === label)!;
const attack = (sheet: Sheet, name: string) => sheet.attacks.find((a) => a.name === name)!;
const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name)!;
const resource = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);
const base: AbilityScores = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
const V10 = 'dndf-10' as RulesVersion;
const V88 = 'dndf-8.8' as RulesVersion;

function maker(version: RulesVersion, classId: string, scores: Partial<AbilityScores>) {
  const rules = loadRules(version);
  const item = (id: string) => rules.get(`item.${id}`)!;
  const make = (level: number, extra: Partial<CharacterDoc> = {}, choices: Record<string, string[]> = {}) => {
    const doc = { ...newCharacter({ name: 'Test', rulesVersion: version, classId, level, scores: { ...base, ...scores }, choices }, rules), ...extra };
    return { doc, sheet: deriveSheet(doc, rules), rules };
  };
  return { make, item, rules };
}

describe.each([V10, V88])('casters (%s)', (version) => {
  it('Chemist: Invention save DC 8 + prof + Wis → 14, attack +6; prepares Wis + level → 8; 2 hours as an abomination at level 5', () => {
    const { sheet } = maker(version, 'class.chemist', { wis: 16 }).make(5);
    expect(formula(sheet, 'Invention save DC').value).toBe(14);
    expect(formula(sheet, 'Invention attack modifier').value).toBe(6);
    expect(feature(sheet, 'Invention Power (Spellcasting)').displays).toEqual([{ label: 'Powers prepared', value: '8' }]);
    expect(feature(sheet, 'Monster Mutation').displays).toEqual([{ label: 'Hours in abomination form', value: '2' }]);
    expect(resource(sheet, 'Monster Mutation')).toMatchObject({ max: 2, recharge: 'short' });
  });

  it('Priest: Spell save DC → 15, attack +7; Channel Divinity 2, then 3 at 6th and 4 at 18th; Kami’s Will pool 5 × level from 3rd', () => {
    const { make } = maker(version, 'class.priest', { wis: 18 });
    const sheet = make(6).sheet;
    expect(formula(sheet, 'Spell save DC').value).toBe(15);
    expect(formula(sheet, 'Spell attack modifier').value).toBe(7);
    expect([2, 6, 18].map((level) => resource(make(level).sheet, 'Channel Divinity')!.max)).toEqual([2, 3, 4]);
    expect(resource(sheet, 'Channel Divinity')!.recharge).toBe('short');
    expect(resource(sheet, 'Kami’s Will healing pool')).toMatchObject({ max: 30, recharge: 'long' });
    expect(resource(make(2).sheet, 'Kami’s Will healing pool')).toBeUndefined();
    expect(feature(sheet, 'Holy Power (Spellcasting)').displays[0]!.value).toBe('10');
    expect(feature(make(8).sheet, 'Blessed Strikes').rolls[0]!.dice).toBe('1d8');
  });

  it('Tinkerer: Creation save DC 8 + prof + Int → 13, attack +5; Recharging recovers half level, rounded up, once a day', () => {
    const { sheet } = maker(version, 'class.tinkerer', { int: 16 }).make(4);
    expect(formula(sheet, 'Creation save DC').value).toBe(13);
    expect(formula(sheet, 'Creation attack modifier').value).toBe(5);
    expect(feature(sheet, 'Recharging').displays).toEqual([{ label: 'Slot levels recovered', value: '2' }]);
    expect(resource(sheet, 'Recharging')).toMatchObject({ max: 1, recharge: 'long' });
    expect(feature(sheet, 'Creation Power (Spellcasting)').displays[0]!.value).toBe('7');
  });

  it('Oracle: Spell save DC 8 + prof + Wis → 14, attack +6', () => {
    const { sheet } = maker(version, 'class.oracle', { wis: 16 }).make(5);
    expect(formula(sheet, 'Spell save DC').value).toBe(14);
    expect(formula(sheet, 'Spell attack modifier').value).toBe(6);
  });
});

describe('Conqueror', () => {
  it.each([V10, V88])('%s: Leadership Dice from the table, rolled and spent; two attacks from 5th', (version) => {
    const { doc, sheet, rules } = maker(version, 'class.conqueror', { wis: 14 }).make(5);
    const leadership = feature(sheet, 'Conqueror’s Leadership');
    expect(leadership.rolls).toEqual([{ label: 'Leadership Die', dice: '1d8', kind: 'other' }]);
    expect(resource(sheet, 'Leadership Dice')).toMatchObject({ max: 4, recharge: 'short' });
    const after = deriveSheet({ ...doc, state: activateFeature(doc.state, sheet, leadership).state }, rules);
    expect(resource(after, 'Leadership Dice')!.remaining).toBe(3);
    expect(sheet.attacksPerAction).toBe(2);
    expect(maker(version, 'class.conqueror', {}).make(4).sheet.attacksPerAction).toBe(1);
  });

  it('switching stance gives 1d4 force damage and Wis temporary hit points in v10 only', () => {
    expect(feature(maker(V10, 'class.conqueror', { wis: 14 }).make(2).sheet, 'Command Stances').rolls.map((r) => [r.dice, r.kind])).toEqual([['1d4', 'damage'], ['2', 'tempHp']]);
    expect(feature(maker(V88, 'class.conqueror', { wis: 14 }).make(2).sheet, 'Command Stances').rolls).toEqual([]);
  });
});

describe('Marksman', () => {
  const scores = { dex: 18, wis: 14 };
  const skilled = { skills: ['perception'] };

  it.each([V10, V88])('%s: Hawk-Eyed doubles proficiency for Perception → +8; Tactic save DC 8 + prof + Wis → 13', (version) => {
    const { sheet } = maker(version, 'class.marksman', scores).make(6, skilled);
    const perception = sheet.skills.find((s) => s.id === 'perception')!;
    expect(perception).toMatchObject({ value: 8, expertise: true });
    expect(sheet.passivePerception.value).toBe(18);
    expect(formula(sheet, 'Tactic save DC').value).toBe(13);
    expect(formula(sheet, 'Tactic attack modifier').value).toBe(5);
    // Not proficient in Perception: nothing to double.
    expect(maker(version, 'class.marksman', scores).make(6).sheet.skills.find((s) => s.id === 'perception')!.value).toBe(2);
  });

  it('Lock-On: 2d4, 3d4 at 6th, 4d4 at 14th in v10; one die fewer in v8.8; + Wis from 6th', () => {
    const dice = (version: RulesVersion) => [1, 6, 14].map((level) => feature(maker(version, 'class.marksman', scores).make(level).sheet, 'Lock-On').rolls[0]!.dice);
    expect(dice(V10)).toEqual(['2d4', '3d4 + 2', '4d4 + 2']);
    expect(dice(V88)).toEqual(['1d4', '2d4 + 2', '3d4 + 2']);
  });

  it('Fighting Style: v10 Improved Aiming +3 to hit, Sharpened Shot + 2 × prof with two-handed ranged; v8.8 Aiming +2, Sharpened Shot +2', () => {
    const shoot = (version: RulesVersion, style: string) => {
      const { make, item } = maker(version, 'class.marksman', scores);
      return attack(make(6, { weapons: [weaponFromItem(item('musket'))!, weaponFromItem(item('shortsword'))!] }, { fightingStyle: [style] }).sheet, 'Musket');
    };
    const plain = maker(V10, 'class.marksman', scores);
    const unstyled = attack(plain.make(6, { weapons: [weaponFromItem(plain.item('musket'))!] }).sheet, 'Musket');
    expect([unstyled.toHit.value, unstyled.damage]).toEqual([7, '1d10 + 4']);
    expect(shoot(V10, 'improved_aiming').toHit.value).toBe(10);
    expect(shoot(V10, 'sharpened_shot').damage).toBe('1d10 + 10');
    expect(shoot(V10, 'close_quarters_shooter').toHit.value).toBe(8);
    expect(shoot(V88, 'aiming').toHit.value).toBe(9);
    expect(shoot(V88, 'sharpened_shot').damage).toBe('1d10 + 6');
    // A style for ranged weapons leaves melee attacks alone.
    const { make, item } = maker(V10, 'class.marksman', scores);
    expect(attack(make(6, { weapons: [weaponFromItem(item('shortsword'))!] }, { fightingStyle: ['improved_aiming'] }).sheet, 'Shortsword').toHit.value).toBe(7);
  });

  it('Extra Attack: two attacks from 5th; three from 14th in v10', () => {
    expect([4, 5, 14].map((level) => maker(V10, 'class.marksman', scores).make(level).sheet.attacksPerAction)).toEqual([1, 2, 3]);
    expect([4, 5, 14].map((level) => maker(V88, 'class.marksman', scores).make(level).sheet.attacksPerAction)).toEqual([1, 2, 2]);
  });
});

describe('Renegade (v10) and Rogue (v8.8)', () => {
  it('Renegade: Press the Attack stacks give +1 to hit each up to +3, and a d4 of damage each', () => {
    const { make, item, rules } = maker(V10, 'class.renegade', { dex: 18 });
    const rapier = [weaponFromItem(item('rapier'))!];
    expect(make(4, { weapons: rapier }).sheet.trackers).toEqual([]);
    const { doc, sheet } = make(8, { weapons: rapier });
    expect(sheet.trackers).toMatchObject([{ id: 'press_the_attack', max: 4, value: 0 }]);
    expect(attack(sheet, 'Rapier').toHit.value).toBe(7);
    const stacked = (n: number) => deriveSheet({ ...doc, state: setTracker(doc.state, sheet, 'press_the_attack', n) }, rules);
    expect(attack(stacked(2), 'Rapier').toHit.value).toBe(9);
    expect(attack(stacked(4), 'Rapier').toHit.value).toBe(10);
    expect(feature(stacked(4), 'Press the Attack').rolls[0]!.dice).toBe('4d4');
    expect(feature(sheet, 'Fast Talker').rolls[0]!.dice).toBe('1d4');
  });

  it('Rogue: Sneak Attack rolls the dice in the Rogue table', () => {
    const { make } = maker(V88, 'class.rogue', { dex: 18 });
    expect(feature(make(1).sheet, 'Sneak Attack').rolls[0]!.dice).toBe('2d6');
    expect(feature(make(20).sheet, 'Sneak Attack').rolls[0]!.dice).toBe('12d6');
    expect(feature(make(5).sheet, 'Uncanny Dodge').action).toBe('reaction');
  });

  it.each([[V10, 'class.renegade'], [V88, 'class.rogue']] as const)('%s %s: Slippery Mind adds Wisdom saves at 15th', (version, classId) => {
    const { make } = maker(version, classId, { wis: 12 });
    expect(make(14).sheet.saves.wis).toMatchObject({ value: 1, proficient: false });
    expect(make(15).sheet.saves.wis).toMatchObject({ value: 6, proficient: true });
  });
});

describe('Warrior', () => {
  const scores = { str: 18, dex: 12 };

  it.each([V10, V88])('%s: Strike save DC 8 + prof + the higher of Str and Dex → 15; Second Wind 1d10 + level; Action Surge twice from 17th', (version) => {
    const { make } = maker(version, 'class.warrior', scores);
    const sheet = make(8).sheet;
    expect(formula(sheet, 'Strike save DC').value).toBe(15);
    expect(formula(sheet, 'Strike save DC').lines.at(-1)).toEqual({ label: 'Strength or Dexterity modifier, whichever is higher', value: 4 });
    expect(feature(sheet, 'Second Wind').rolls).toEqual([{ label: 'Hit points regained', dice: '1d10 + 8', kind: 'heal' }]);
    expect(resource(sheet, 'Action Surge')!.max).toBe(1);
    expect(resource(make(17).sheet, 'Action Surge')).toMatchObject({ max: 2, recharge: 'short' });
    expect(feature(sheet, 'Dashing Strike').rolls[0]!.dice).toBe('2d8 + 4');
    expect(feature(sheet, 'Crescent Strike').rolls[0]!.dice).toBe('3d6 + 4');
    expect([4, 5, 11, 20].map((level) => make(level).sheet.attacksPerAction)).toEqual([1, 2, 3, 4]);
  });

  it('Execute: the Execute Dice column in v10 (3d6 at 8th), a flat 2d8 in v8.8', () => {
    expect(feature(maker(V10, 'class.warrior', scores).make(8).sheet, 'Execute').rolls[0]!.dice).toBe('3d6');
    expect(feature(maker(V10, 'class.warrior', scores).make(2).sheet, 'Execute').rolls[0]!.dice).toBe('1d6');
    expect(feature(maker(V88, 'class.warrior', scores).make(8).sheet, 'Execute').rolls[0]!.dice).toBe('2d8');
    expect(feature(maker(V10, 'class.warrior', scores).make(9).sheet, 'Aura of Endurance').displays).toEqual([{ label: 'Saving throw bonus', value: '2' }]);
  });

  it.each([V10, V88])('%s Fighting Style: Defense +1 AC in armor, Mariner +1 AC without heavy armor or shield, Interception 1d10 + prof', (version) => {
    const { make, item } = maker(version, 'class.warrior', scores);
    const chain = armorFromItem(item('chain_mail'));
    const hide = armorFromItem(item('hide'));
    expect(make(5, { armor: chain }).sheet.ac.value).toBe(16);
    expect(make(5, { armor: chain }, { fightingStyle: ['defense'] }).sheet.ac.value).toBe(17);
    expect(make(5, {}, { fightingStyle: ['defense'] }).sheet.ac.value).toBe(11); // no armor, no bonus
    expect(make(5, {}, { fightingStyle: ['mariner'] }).sheet.ac.value).toBe(12);
    expect(make(5, { armor: hide }, { fightingStyle: ['mariner', 'defense'] }).sheet.ac.value).toBe(15); // Hide 12 + Dex 1 + 1 + 1
    expect(make(5, { armor: chain }, { fightingStyle: ['mariner'] }).sheet.ac.value).toBe(16); // heavy armor: no Mariner bonus
    expect(make(5, { shield: true }, { fightingStyle: ['mariner'] }).sheet.ac.value).toBe(13); // shield: no Mariner bonus
    const styled = make(5, {}, { fightingStyle: ['interception'] }).sheet;
    expect(feature(styled, 'Interception').rolls[0]!.dice).toBe('1d10 + 3');
    expect(feature(styled, 'Interception').action).toBe('reaction');
    expect(styled.warnings).toEqual([]);
  });

  it('Aiming: +1 to ranged attacks in v10, +2 in v8.8', () => {
    const hit = (version: RulesVersion) => {
      const { make, item } = maker(version, 'class.warrior', scores);
      return attack(make(5, { weapons: [weaponFromItem(item('musket'))!] }, { fightingStyle: ['aiming'] }).sheet, 'Musket').toHit.value;
    };
    expect([hit(V10), hit(V88)]).toEqual([5, 6]);
  });
});

describe('Extra Attack for the classes wired earlier', () => {
  it.each([[V10, 'class.hybrid'], [V88, 'class.hybrid'], [V10, 'class.martial_artist'], [V10, 'class.devilforged']] as const)('%s %s: two attacks from 5th level', (version, classId) => {
    const { make } = maker(version, classId, {});
    expect([4, 5].map((level) => make(level).sheet.attacksPerAction)).toEqual([1, 2]);
  });
});
