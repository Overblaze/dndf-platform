// The numbers each wired class adds to the sheet (docs/FORMULAS.md: Martial Artist, Hybrid,
// Virtuoso / Skald, Devilforged). Run against both handbooks where the class is in both.
import { describe, expect, it } from 'vitest';
import marlo from '../../../data/examples/marlo_devilforged5_v88.json';
import { activateFeature, armorFromItem, deriveSheet, longRest, newCharacter, setTracker, weaponFromItem, type CharacterDoc, type RulesVersion, type Sheet } from '../src';
import { loadRules } from './load';

const formula = (sheet: Sheet, label: string) => sheet.formulas.find((f) => f.label === label)!;
const attack = (sheet: Sheet, name: string) => sheet.attacks.find((a) => a.name === name)!;
const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name)!;

describe.each(['dndf-10', 'dndf-8.8'] as const)('Martial Artist (%s)', (version) => {
  const rules = loadRules(version);
  const item = (id: string) => rules.get(`item.${id}`)!;
  const scores = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 };
  const make = (level: number, extra: Partial<CharacterDoc> = {}) => {
    const doc = { ...newCharacter({ name: 'Koby', rulesVersion: version, classId: 'class.martial_artist', level, scores }, rules), ...extra };
    return { doc, sheet: deriveSheet(doc, rules) };
  };
  const { doc, sheet } = make(7);

  it('Unarmored Defense: 10 + Dex + Wis with no armor and no shield → 15', () => {
    expect(sheet.ac.value).toBe(15);
    expect(sheet.ac.lines.map((l) => l.value)).toEqual([10, 3, 2]);
    expect(make(7, { shield: true }).sheet.ac.value).toBe(15); // 10 + Dex 3 + shield 2
    expect(make(7, { armor: armorFromItem(item('hide')) }).sheet.ac.value).toBe(14); // Hide 12 + Dex (max 2)
  });

  it('Unarmored Movement: + the table\'s bonus to speed → 45 ft at level 7', () => {
    expect(sheet.speed.value).toBe(45);
    expect([1, 2, 6, 10, 14, 18].map((level) => make(level).sheet.speed.value)).toEqual([30, 40, 45, 50, 55, 60]);
    expect(make(7, { armor: armorFromItem(item('hide')) }).sheet.speed.value).toBe(30);
  });

  it('Martial Arts: Dexterity and the Martial Arts die for unarmed strikes and martial artist weapons → +6, 1d8 + 3', () => {
    const armed = make(7, { weapons: [weaponFromItem(item('club'))!, weaponFromItem(item('shortsword'))!, weaponFromItem(item('longsword'))!] }).sheet;
    expect(attack(armed, 'Unarmed strike')).toMatchObject({ damage: '1d8 + 3' });
    expect(attack(armed, 'Unarmed strike').toHit.value).toBe(6);
    expect(attack(armed, 'Club').damage).toBe('1d8 + 3'); // d4 club uses the larger Martial Arts die
    expect(attack(armed, 'Shortsword').toHit.value).toBe(6);
    // A longsword is not a martial artist weapon: Strength, its own die, and no proficiency.
    expect(attack(armed, 'Longsword')).toMatchObject({ damage: '1d8' });
    expect(attack(armed, 'Longsword').toHit.value).toBe(0);
    expect(attack(make(1).sheet, 'Unarmed strike').damage).toBe('1d6 + 3');
    expect(attack(make(17).sheet, 'Unarmed strike').damage).toBe('1d12 + 3');
  });

  it('Martial Arts needs no armor and no shield', () => {
    const armored = make(7, { armor: armorFromItem(item('hide')) }).sheet;
    expect(attack(armored, 'Unarmed strike').damage).toBe('1');
    expect(attack(armored, 'Unarmed strike').toHit.value).toBe(3);
  });

  it('Ki save DC: 8 + prof + Wis → 13', () => {
    expect(formula(sheet, 'Ki save DC')).toMatchObject({ value: 13, calculated: 13 });
    expect(formula(sheet, 'Ki save DC').lines.map((l) => l.label)).toEqual(['Base', 'Proficiency bonus', 'Wisdom modifier']);
    expect(formula(deriveSheet({ ...doc, overrides: { 'formula.kiDC': 15 } }, rules), 'Ki save DC')).toMatchObject({ value: 15, calculated: 13, overridden: true });
  });

  it('Deflect Projectile: 1d10 + Dex + level → 1d10 + 10; Slow Fall: 5 × level → 35', () => {
    expect(feature(sheet, 'Deflect Projectile').rolls.map((r) => r.dice)).toEqual(['1d10 + 10', '2d8']);
    expect(feature(sheet, 'Deflect Projectile').action).toBe('reaction');
    expect(feature(sheet, 'Slow Fall').displays).toEqual([{ label: 'Falling damage reduced', value: '35' }]);
  });

  it('Stunning Strike spends a ki point', () => {
    const after = deriveSheet({ ...doc, state: activateFeature(doc.state, sheet, feature(sheet, 'Stunning Strike')).state }, rules);
    expect(after.resources.find((r) => r.id === 'ki')).toMatchObject({ max: 7, remaining: 6 });
  });
});

describe.each(['dndf-10', 'dndf-8.8'] as const)('Hybrid (%s)', (version) => {
  const rules = loadRules(version);
  const scores = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 16 };
  const make = (level: number) => newCharacter({ name: 'Queen', rulesVersion: version, classId: 'class.hybrid', level, scores }, rules);
  const holding = (level: number, points: number) => {
    const doc = make(level);
    return deriveSheet({ ...doc, state: setTracker(doc.state, deriveSheet(doc, rules), 'hybrid_points', points) }, rules);
  };
  const doc = make(5);
  const sheet = deriveSheet(doc, rules);

  it('Hybrid save DC 8 + prof + Cha → 14; attack prof + Cha → +6', () => {
    expect(formula(sheet, 'Hybrid save DC').value).toBe(14);
    expect(formula(sheet, 'Hybrid attack modifier').value).toBe(6);
  });

  it('Close Quarters Training: unarmed strikes deal 1d8, with Strength or Dexterity → +6, 1d8 + 3', () => {
    expect(attack(sheet, 'Unarmed strike').damage).toBe('1d8 + 3');
    expect(attack(sheet, 'Unarmed strike').toHit.value).toBe(6);
    const nimble = deriveSheet({ ...doc, scores: { ...scores, str: 10, dex: 18 } }, rules);
    expect(attack(nimble, 'Unarmed strike').damage).toBe('1d8 + 4');
  });

  it('Hybrid Points: held up to the Power Threshold maximum for the level', () => {
    expect(sheet.trackers).toMatchObject([{ id: 'hybrid_points', name: 'Hybrid Points', value: 0, max: 4, reset: 'long' }]);
    expect(holding(5, 99).trackers[0]!.value).toBe(4);
    expect(holding(20, 99).trackers[0]!.value).toBe(10);
  });

  it('Power Threshold: +1 melee damage per 2 points, +1 AC per 5, +1 melee attack per 3', () => {
    const none = holding(10, 0);
    const some = holding(10, 7);
    expect(attack(some, 'Unarmed strike').toHit.value - attack(none, 'Unarmed strike').toHit.value).toBe(2);
    expect(attack(some, 'Unarmed strike').damage).toBe('1d8 + 6');
    expect(some.ac.value - none.ac.value).toBe(1);
    expect(some.ac.lines.at(-1)).toEqual({ label: 'Power Threshold', value: 1 });
    expect(none.ac.lines.some((l) => l.label === 'Power Threshold')).toBe(false);
    // Power Threshold starts at 2nd level: points held at 1st level change nothing.
    expect(attack(holding(1, 2), 'Unarmed strike').damage).toBe(attack(holding(1, 0), 'Unarmed strike').damage);
  });

  it('Energy Transfer gains 2 points, Defensive Augment spends 2, and a long rest returns them to 0', () => {
    const level = 6;
    const d = make(level);
    const s = deriveSheet(d, rules);
    let state = activateFeature(d.state, s, feature(s, 'Energy Transfer')).state;
    expect(state.trackers.hybrid_points).toBe(2);
    expect(feature(s, 'Energy Transfer').rolls).toEqual([{ label: 'Force damage', dice: '1d4', kind: 'damage' }]);
    const spent = activateFeature(state, deriveSheet({ ...d, state }, rules), feature(s, 'Defensive Augment'));
    expect(spent.state.trackers.hybrid_points).toBe(0);
    expect(spent.warning).toBeUndefined();
    const short = activateFeature(spent.state, deriveSheet({ ...d, state: spent.state }, rules), feature(s, 'Defensive Augment'));
    expect(short.warning).toBe('Not enough Hybrid Points.');
    state = setTracker(d.state, s, 'hybrid_points', 4);
    const rested = longRest({ ...d, state }, deriveSheet({ ...d, state }, rules));
    expect(rested.state.trackers.hybrid_points).toBeUndefined();
    expect(rested.changes).toContain('Hybrid Points 4 → 0');
  });
});

describe.each([['dndf-10', 'class.virtuoso'], ['dndf-8.8', 'class.skald']] as const)('Spirit caster (%s %s)', (version, classId) => {
  const rules = loadRules(version as RulesVersion);
  const scores = { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 18 };
  const make = (level: number, extra: Partial<CharacterDoc> = {}) =>
    deriveSheet({ ...newCharacter({ name: 'Brook', rulesVersion: version, classId, level, scores, skills: ['performance'] }, rules), ...extra }, rules);
  const sheet = make(5);

  it('Spirit save DC 8 + prof + Cha → 15; attack prof + Cha → +7', () => {
    expect(formula(sheet, 'Spirit save DC').value).toBe(15);
    expect(formula(sheet, 'Spirit attack modifier').value).toBe(7);
  });

  it('Jack of All Trades: half proficiency, rounded down, on checks without proficiency → +1 at level 5', () => {
    const skill = (s: Sheet, id: string) => s.skills.find((k) => k.id === id)!;
    expect(skill(sheet, 'stealth').value).toBe(3); // Dex 2 + 1
    expect(skill(sheet, 'stealth').lines.at(-1)!.label).toMatch(/^Jack of All Trades/);
    expect(skill(sheet, 'performance').value).toBe(7); // Cha 4 + prof 3, no half on top
    expect(sheet.initiative.value).toBe(3);
    expect(skill(make(1), 'stealth').value).toBe(2);
    expect(skill(make(9), 'stealth').value).toBe(4);
  });

  it('Harmonic Weaponry: Charisma for the chosen weapon → rapier +7, 1d8 + 4', () => {
    const rapier = { ...weaponFromItem(rules.get('item.rapier')!)!, ability: 'cha' as const };
    const armed = make(5, { weapons: [rapier, weaponFromItem(rules.get('item.dagger')!)!] });
    expect(attack(armed, 'Rapier').toHit.value).toBe(7);
    expect(attack(armed, 'Rapier').damage).toBe('1d8 + 4');
    expect(attack(armed, 'Dagger').damage).toBe('1d4 + 2'); // finesse: Dex
  });

  it('Song of the Sea: 1d6, then 1d8 at 9th, 1d10 at 13th, 1d12 at 17th', () => {
    expect([2, 9, 13, 17].map((level) => feature(make(level), 'Song of the Sea').rolls[0]!.dice)).toEqual(['1d6', '1d8', '1d10', '1d12']);
  });

  it('holds up to three floating chords', () => {
    expect(sheet.trackers).toMatchObject([{ id: 'chords', min: 0, max: 3, value: 0 }]);
  });
});

describe('Devilforged', () => {
  it('v8.8: Spell save DC 8 + prof + Cha, attack prof + Cha → Marlo 15 and +7', () => {
    const rules = loadRules('dndf-8.8');
    const doc = newCharacter({ name: marlo.name, rulesVersion: 'dndf-8.8', classId: 'class.devilforged', level: 5, scores: marlo.abilityScores.final, subclass: 'subclass.devilforged.blade_smithing' }, rules);
    const katana = { ...weaponFromItem(rules.get('item.katana')!)!, ability: 'cha' as const, proficient: true };
    const sheet = deriveSheet({ ...doc, weapons: [katana] }, rules);
    expect(formula(sheet, 'Spell save DC').value).toBe(marlo.derived.spellSaveDC.value);
    expect(formula(sheet, 'Spell attack modifier').value).toBe(marlo.derived.spellAttack.value);
    // Hell's Duelist: Charisma for the weapon. The infused fruit's +1 is added by hand until fruits are loaded.
    expect(attack(sheet, 'Katana').toHit.value).toBe(7);
    expect(attack(sheet, 'Katana').damage).toBe('1d8 + 4');
    expect(attack(deriveSheet({ ...doc, weapons: [{ ...katana, bonus: 1 }] }, rules), 'Katana').toHit.value).toBe(marlo.infusedWeapon.attack.toHit);
  });

  it('v10: Devilforged save DC 8 + prof + Int, attack prof + Int', () => {
    const rules = loadRules('dndf-10');
    const scores = { str: 10, dex: 14, con: 14, int: 16, wis: 10, cha: 10 };
    const sheet = deriveSheet(newCharacter({ name: 'Smith', classId: 'class.devilforged', level: 5, scores }, rules), rules);
    expect(formula(sheet, 'Devilforged save DC').value).toBe(14);
    expect(formula(sheet, 'Devilforged attack modifier').value).toBe(6);
  });
});

describe('the Bruiser is unchanged by the wiring', () => {
  it('still shows the Fury save DC as a formula with its breakdown', () => {
    const rules = loadRules('dndf-10');
    const scores = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
    const sheet = deriveSheet(newCharacter({ name: 'Kaito', level: 7, scores }, rules), rules);
    expect(formula(sheet, 'Fury save DC').value).toBe(14);
    expect(sheet.ac.value).toBe(15);
    expect(attack(sheet, 'Unarmed strike').damage).toBe('1d6 + 4');
  });
});
