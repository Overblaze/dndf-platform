// The numbers subclasses add to the sheet (docs/FORMULAS.md, "Subclasses"), each worked out by hand
// from the handbook named beside it. Shared subclasses are checked in both handbooks.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, type AbilityScores, type CharacterDoc, type RuleEntry, type RulesVersion, type Sheet } from '../src';
import { loadRules } from './load';

const V10 = 'dndf-10' as RulesVersion;
const V88 = 'dndf-8.8' as RulesVersion;
const BOTH = [V10, V88];
const base: AbilityScores = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
const skill = (sheet: Sheet, id: string) => sheet.skills.find((s) => s.id === id)!;
const notes = (sheet: Sheet) => sheet.notes.map((n) => n.label);

function build(version: RulesVersion, classId: string, subclass: string, level: number, scores: Partial<AbilityScores> = {}, on: string[] = [], extra: Partial<CharacterDoc> = {}) {
  const rules = loadRules(version);
  expect(rules.get(subclass)?.kind, `${subclass} in ${version}`).toBe('subclass');
  const doc = { ...newCharacter({ name: 'Test', rulesVersion: version, classId, level, scores: { ...base, ...scores }, subclass }, rules), ...extra };
  const switched = { ...doc, state: { ...doc.state, toggles: Object.fromEntries(on.map((id) => [id, true])) } };
  return deriveSheet(switched, rules);
}

describe('armor a subclass gives', () => {
  it.each(BOTH)('Hybrid, Beast Lineage: Prototype Augmentations +2 AC → 10 + Dex 2 + 2 = 14 (%s)', (version) => {
    expect(build(version, 'class.hybrid', 'subclass.hybrid.beast', 6, { dex: 14 }).ac.value).toBe(14);
  });

  it.each(BOTH)('Hybrid, Germa Lineage: Combat Exoskeleton 13 + Str 3 = 16, and 1 hit point per hybrid level (%s)', (version) => {
    const sheet = build(version, 'class.hybrid', 'subclass.hybrid.germa', 4, { str: 16 });
    expect(sheet.ac.value).toBe(16);
    expect(sheet.maxHp.value).toBe(10 + 3 * 6 + 2 * 4 + 4); // d10: 10, then 6 a level; Con 2 a level; exoskeleton 1 a level
  });

  it.each(BOTH)('Hybrid, Seraphim Lineage: S-Defensive Protocol 13 + Con 3 = 16 from 6th level; fire resistance from 1st (%s)', (version) => {
    expect(build(version, 'class.hybrid', 'subclass.hybrid.seraphim', 5, { con: 16 }).ac.value).toBe(10);
    const sheet = build(version, 'class.hybrid', 'subclass.hybrid.seraphim', 6, { con: 16 });
    expect(sheet.ac.value).toBe(16);
    expect(notes(sheet)).toContain('Resistance to fire damage');
  });

  it('Hybrid, Mother Flame (v8.8 only): Void Awakening 15 + Wis 2 = 17', () => {
    expect(build(V88, 'class.hybrid', 'subclass.hybrid.mother_flame', 1, { wis: 14 }).ac.value).toBe(17);
  });

  it.each(BOTH)('Priest, Infernal Domain: Fiendish Skin 10 + prof 3 + Wis 4 = 17 (%s)', (version) => {
    const sheet = build(version, 'class.priest', 'subclass.priest.infernal', 6, { wis: 18 });
    expect(sheet.ac.value).toBe(17);
    expect(sheet.ac.lines.length).toBeGreaterThan(0);
  });

  it('Martial Artist, Combustion Boxer: Toughened Body adds Con to Unarmored Defense at 11th → 10 + Dex 3 + Wis 2 + Con 2 = 17', () => {
    expect(build(V10, 'class.martial_artist', 'subclass.martial_artist.combustion_boxer', 10, { dex: 16, wis: 14 }).ac.value).toBe(15);
    expect(build(V10, 'class.martial_artist', 'subclass.martial_artist.combustion_boxer', 11, { dex: 16, wis: 14 }).ac.value).toBe(17);
  });

  it('Martial Artist, Black Leg Style (v8.8): + half proficiency, rounded up, with no weapon or shield → 12 + ceil(3 / 2) = 14', () => {
    const scores = { dex: 14 };
    expect(build(V88, 'class.martial_artist', 'subclass.martial_artist.black_leg_style', 5, scores).ac.value).toBe(12);
    expect(build(V88, 'class.martial_artist', 'subclass.martial_artist.black_leg_style', 5, scores, ['black_leg_guard']).ac.value).toBe(14);
  });
});

describe('switches a subclass puts on the sheet', () => {
  it('Devilforged, Devil Blade: Hell’s Duelist +1 AC while wielding an infused melee weapon', () => {
    const off = build(V10, 'class.devilforged', 'subclass.devilforged.devil_blade', 3);
    const on = build(V10, 'class.devilforged', 'subclass.devilforged.devil_blade', 3, {}, ['infused_blade']);
    expect(on.ac.value).toBe(off.ac.value + 1);
  });

  it('Devilforged, Devil Bulwark: Defenders Leap +1 AC at 6th, +2 at 10th, +3 at 14th with the infused shield', () => {
    const bonus = (level: number) =>
      build(V10, 'class.devilforged', 'subclass.devilforged.devil_bulwark', level, {}, ['infused_shield']).ac.value - build(V10, 'class.devilforged', 'subclass.devilforged.devil_bulwark', level).ac.value;
    expect([5, 6, 10, 14].map(bonus)).toEqual([0, 1, 2, 3]);
  });

  it('Devilforged, Gear Smithing (v8.8): Armored Up +1 AC with the infused item', () => {
    const off = build(V88, 'class.devilforged', 'subclass.devilforged.gear_smithing', 1);
    expect(build(V88, 'class.devilforged', 'subclass.devilforged.gear_smithing', 1, {}, ['infused_item']).ac.value).toBe(off.ac.value + 1);
  });

  it.each(BOTH)('Conqueror, Warmonger: Warmonger’s Rage +10 feet, +30 from 16th (%s)', (version) => {
    const speed = (level: number, on: string[]) => build(version, 'class.conqueror', 'subclass.conqueror.warmonger', level, {}, on).speed.value;
    expect(speed(6, [])).toBe(30);
    expect(speed(6, ['warmongers_rage'])).toBe(40);
    expect(speed(16, ['warmongers_rage'])).toBe(60);
    expect(notes(build(version, 'class.conqueror', 'subclass.conqueror.warmonger', 16, {}, ['warmongers_rage']))).toContain('Three additional weapon attacks when you take the Attack action');
  });

  it('Renegade, Circus Tricks: Trick Rider +25 feet on the prop; Mountain Climb’s climbing speed only while riding', () => {
    expect(build(V10, 'class.renegade', 'subclass.renegade.circus_tricks', 13).speed.value).toBe(30);
    const riding = build(V10, 'class.renegade', 'subclass.renegade.circus_tricks', 13, {}, ['trick_rider']);
    expect(riding.speed.value).toBe(55);
    expect(notes(riding)).toContain('Climbing speed equal to your walking speed');
    expect(notes(build(V10, 'class.renegade', 'subclass.renegade.circus_tricks', 13))).not.toContain('Climbing speed equal to your walking speed');
  });

  it.each(BOTH)('Tinkerer, Military Science: Durable Tech +2 AC while concentrating (%s)', (version) => {
    const level = (loadRules(version).get('subclass.tinkerer.military_science')!.features as { name: string; level: number }[]).find((f) => f.name === 'Durable Tech')!.level;
    const off = build(version, 'class.tinkerer', 'subclass.tinkerer.military_science', level);
    expect(build(version, 'class.tinkerer', 'subclass.tinkerer.military_science', level, {}, ['durable_tech']).ac.value).toBe(off.ac.value + 2);
  });

  it.each(BOTH)('Tinkerer, Meteorology: resistance while holding the gadget, immunity from 18th (%s)', (version) => {
    expect(notes(build(version, 'class.tinkerer', 'subclass.tinkerer.meteorology', 6, {}, ['holding_gadget']))).toContain('Resistance to lightning and thunder damage');
    const late = notes(build(version, 'class.tinkerer', 'subclass.tinkerer.meteorology', 18, {}, ['holding_gadget']));
    expect(late).toContain('Immune to lightning and thunder damage');
    expect(late).not.toContain('Resistance to lightning and thunder damage');
  });

  it.each(BOTH)('Warrior, Cursed Soul: Silver Mist +2 AC; Ryuo Samurai: Ryuo Master +2 to hit and damage (%s)', (version) => {
    const off = build(version, 'class.warrior', 'subclass.warrior.cursed_soul', 15);
    expect(build(version, 'class.warrior', 'subclass.warrior.cursed_soul', 15, {}, ['silver_mist']).ac.value).toBe(off.ac.value + 2);
    const plain = build(version, 'class.warrior', 'subclass.warrior.ryuo_samurai', 18, { str: 16 });
    const blades = build(version, 'class.warrior', 'subclass.warrior.ryuo_samurai', 18, { str: 16 }, ['black_blades']);
    expect(blades.attacks[0]!.toHit.value).toBe(plain.attacks[0]!.toHit.value + 2);
  });

  it.each(BOTH)('Bruiser, Drunken Dragon: Sorrowful Stagger −10 feet and resistance to all damage (%s)', (version) => {
    const sheet = build(version, 'class.bruiser', 'subclass.bruiser.drunken_dragon', 3, {}, ['sorrowful_stagger']);
    expect(sheet.speed.value).toBe(build(version, 'class.bruiser', 'subclass.bruiser.drunken_dragon', 3).speed.value - 10);
    expect(notes(sheet)).toContain('Resistance to all damage');
  });
});

describe('initiative, speed, hit points and attacks', () => {
  it('Marksman, Gunslinger: Quick-draw adds Wis 3 to initiative → Dex 2 + 3 = 5; Iron Mind makes Wisdom saves proficient at 7th', () => {
    const sheet = build(V10, 'class.marksman', 'subclass.marksman.gunslinger', 7, { dex: 14, wis: 16 });
    expect(sheet.initiative.value).toBe(5);
    expect(sheet.saves.wis.value).toBe(3 + 3); // Wis 3 + prof 3
    expect(build(V10, 'class.marksman', 'subclass.marksman.gunslinger', 6, { dex: 14, wis: 16 }).saves.wis.value).toBe(3);
  });

  it('Renegade, Swashbuckler (v10) and Rogue, Swashbuckler (v8.8): Charisma 3 added to initiative → Dex 2 + 3 = 5', () => {
    expect(build(V10, 'class.renegade', 'subclass.renegade.swashbuckler', 3, { dex: 14, cha: 16 }).initiative.value).toBe(5);
    expect(build(V88, 'class.rogue', 'subclass.rogue.swashbuckler', 3, { dex: 14, cha: 16 }).initiative.value).toBe(5);
  });

  it.each(BOTH)('Tinkerer, Military Science: Tactical Mind adds Int 4 to initiative → Dex 1 + 4 = 5; never a penalty (%s)', (version) => {
    const level = (loadRules(version).get('subclass.tinkerer.military_science')!.features as { name: string; level: number }[]).find((f) => f.name === 'Tactical Mind')!.level;
    expect(build(version, 'class.tinkerer', 'subclass.tinkerer.military_science', level, { dex: 12, int: 18 }).initiative.value).toBe(5);
    expect(build(version, 'class.tinkerer', 'subclass.tinkerer.military_science', level, { dex: 12, int: 8 }).initiative.value).toBe(1);
  });

  it.each(BOTH)('Martial Artist, Black Leg Style: Sky Step +10 feet of walking speed at 6th (%s)', (version) => {
    const speed = (subclass: string) => build(version, 'class.martial_artist', subclass, 6).speed.value;
    expect(speed('subclass.martial_artist.black_leg_style')).toBe(speed('subclass.martial_artist.wano_ninpo') + 10);
  });

  it('Virtuoso, School of Battlehymn (v10): twice the virtuoso level in hit points; two attacks from 6th', () => {
    const sheet = build(V10, 'class.virtuoso', 'subclass.virtuoso.battlehymn', 6);
    expect(sheet.maxHp.value).toBe(8 + 5 * 5 + 2 * 6 + 12); // d8: 8, then 5 a level; Con 2 a level; Battle Proficiencies 2 a level
    expect(sheet.attacksPerAction).toBe(2);
    expect(build(V10, 'class.virtuoso', 'subclass.virtuoso.battlehymn', 5).attacksPerAction).toBe(1);
  });

  it('Skald, School of Battlehymn (v8.8): Extra Attack at 6th, and no extra hit points', () => {
    const sheet = build(V88, 'class.skald', 'subclass.skald.battlehymn', 6);
    expect(sheet.attacksPerAction).toBe(2);
    expect(sheet.maxHp.value).toBe(8 + 5 * 5 + 2 * 6);
  });
});

describe('skills and saves', () => {
  it('Marksman, Beast Tamer: expertise in Animal Handling in v10 (Wis 2 + 2 × prof 2 = 6), proficiency in v8.8 (Wis 2 + 2 = 4)', () => {
    expect(skill(build(V10, 'class.marksman', 'subclass.marksman.beast_tamer', 3, { wis: 14 }), 'animal_handling').value).toBe(6);
    expect(skill(build(V88, 'class.marksman', 'subclass.marksman.beast_tamer', 3, { wis: 14 }), 'animal_handling').value).toBe(4);
  });

  it.each(BOTH)('Martial Artist, Wano Ninpo: expertise in Stealth → Dex 3 + 2 × prof 2 = 7 (%s)', (version) => {
    expect(skill(build(version, 'class.martial_artist', 'subclass.martial_artist.wano_ninpo', 3, { dex: 16 }), 'stealth').value).toBe(7);
  });

  it('Wordsmithing: expertise in Persuasion → Cha 3 + 2 × prof 2 = 7, for the v10 Virtuoso and the v8.8 Skald', () => {
    expect(skill(build(V10, 'class.virtuoso', 'subclass.virtuoso.wordsmithing', 3, { cha: 16 }), 'persuasion').value).toBe(7);
    expect(skill(build(V88, 'class.skald', 'subclass.skald.wordsmithing', 3, { cha: 16 }), 'persuasion').value).toBe(7);
  });

  it('Warrior, Kuja Huntress: expertise in Acrobatics and Survival → Dex 2 + 4 = 6, Wis 1 + 4 = 5', () => {
    const sheet = build(V10, 'class.warrior', 'subclass.warrior.kuja_huntress', 3, { dex: 14, wis: 12 });
    expect(skill(sheet, 'acrobatics').value).toBe(6);
    expect(skill(sheet, 'survival').value).toBe(5);
  });

  it.each(BOTH)('Oracle, Voices of the Past: proficiency in History → Int 1 + prof 2 = 3 (%s)', (version) => {
    expect(skill(build(version, 'class.oracle', 'subclass.oracle.voices_of_the_past', 2, { int: 12 }), 'history').value).toBe(3);
  });
});

describe('pools a subclass owns', () => {
  const pool = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);
  const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name)!;
  const dieAt = (version: RulesVersion, classId: string, subclass: string, name: string, levels: number[], scores: Partial<AbilityScores> = {}) =>
    levels.map((level) => feature(build(version, classId, subclass, level, scores), name).rolls[0]!.dice);

  it.each(BOTH)('Warrior, Ryuo Samurai: twice proficiency in Ryuo Dice, back on a long rest; d6, d8 at 5th, d10 at 11th, d12 at 17th; save DC 8 + prof + Str (%s)', (version) => {
    const sheet = build(version, 'class.warrior', 'subclass.warrior.ryuo_samurai', 5, { str: 16 });
    expect(pool(sheet, 'Ryuo Training')).toMatchObject({ max: 6, recharge: 'long' }); // prof 3 × 2
    expect(pool(build(version, 'class.warrior', 'subclass.warrior.ryuo_samurai', 17), 'Ryuo Training')!.max).toBe(12); // prof 6 × 2
    expect(dieAt(version, 'class.warrior', 'subclass.warrior.ryuo_samurai', 'Ryuo Training', [3, 5, 11, 17])).toEqual(['1d6', '1d8', '1d10', '1d12']);
    expect(feature(sheet, 'Ryuo Training').displays).toContainEqual({ label: 'Ryuo save DC', value: '14' }); // 8 + 3 + 3
  });

  it.each(BOTH)('Warrior, Cursed Soul: twice proficiency in Cursed Spirit dice; d6, d8 at 5th, d10 at 11th, d12 at 17th; Curse save DC 8 + prof + Int (%s)', (version) => {
    const sheet = build(version, 'class.warrior', 'subclass.warrior.cursed_soul', 9, { int: 14 });
    expect(pool(sheet, 'Champion of Malice')).toMatchObject({ max: 8, recharge: 'long' }); // prof 4 × 2
    expect(dieAt(version, 'class.warrior', 'subclass.warrior.cursed_soul', 'Champion of Malice', [3, 5, 11, 17])).toEqual(['1d6', '1d8', '1d10', '1d12']);
    expect(feature(sheet, 'Champion of Malice').displays).toContainEqual({ label: 'Curse save DC', value: '14' }); // 8 + 4 + 2
  });

  it.each(BOTH)('Warrior, Ramen Kenpo: Ramen Die d4, d6 at 7th, d8 at 10th, d10 at 15th, d12 at 18th; dishes twice proficiency; a dish gives dice + half level (%s)', (version) => {
    const sub = 'subclass.warrior.ramen_kenpo';
    expect(dieAt(version, 'class.warrior', sub, 'Apprentice Chef', [3, 7, 10, 15, 18])).toEqual(['2d4', '2d6', '2d8', '2d10', '2d12']);
    const sheet = build(version, 'class.warrior', sub, 10, { con: 16, dex: 14 });
    expect(feature(sheet, 'Apprentice Chef').rolls[1]!.dice).toBe('2d8 + 2'); // Noodle Whip: 2 Ramen Dice + the better of Str 0 and Dex 2
    expect(feature(sheet, 'Apprentice Chef').displays).toContainEqual({ label: 'Ramen save DC', value: '15' }); // 8 + 4 + 3
    expect(pool(sheet, 'Home Cooking')).toMatchObject({ max: 8, recharge: 'short' });
    expect(dieAt(version, 'class.warrior', sub, 'Home Cooking', [3, 10, 15, 18])).toEqual(['1d4 + 2', '2d8 + 5', '3d10 + 8', '4d12 + 9']); // one more die at 10th, 15th and 18th
  });

  it.each(BOTH)('Oracle, Eyes of the Future: proficiency in dice of eternity, back on a short rest; d6 at 5th up to d12 at 17th (%s)', (version) => {
    const sub = 'subclass.oracle.eyes_of_the_future';
    const level = (loadRules(version).get(sub)!.features as { name: string; level: number }[]).find((f) => f.name === 'Dice of Eternity')!.level;
    expect(pool(build(version, 'class.oracle', sub, 9), 'Dice of Eternity')).toMatchObject({ max: 4, recharge: 'short' });
    expect(dieAt(version, 'class.oracle', sub, 'Dice of Eternity', [Math.max(level, 5), 9, 13, 17])).toEqual(['1d6', '1d8', '1d10', '1d12']);
  });

  it.each(BOTH)('Oracle, Occult Sigilist: twice proficiency in sigil dice; d4, d6 at 5th, d8 at 11th, d10 at 17th (%s)', (version) => {
    const sub = 'subclass.oracle.occult_sigilist';
    expect(pool(build(version, 'class.oracle', sub, 2), 'Sacrificial Sigil Creation')).toMatchObject({ max: 4, recharge: 'long' });
    expect(dieAt(version, 'class.oracle', sub, 'Sacrificial Sigil Creation', [2, 5, 11, 17])).toEqual(['1d4', '1d6', '1d8', '1d10']);
  });

  it.each(BOTH)('Oracle, Soul of the Present: Soul Aura proficiency times a long rest, doubled by Sustained Vitality at 11th; grants Wis + level temporary hit points (%s)', (version) => {
    const sub = 'subclass.oracle.soul_of_the_present';
    const at = (level: number) => build(version, 'class.oracle', sub, level, { wis: 16 });
    expect(pool(at(10), 'Soul Aura')).toMatchObject({ max: 4, recharge: 'long' });
    expect(pool(at(11), 'Soul Aura')!.max).toBe(8);
    expect(pool(at(11), 'Sustained Vitality')).toBeUndefined();
    expect(feature(at(4), 'Soul Aura').rolls[0]!.dice).toBe('7'); // Wis 3 + level 4
  });

  it.each(BOTH)('counts uses for the features the detector now reads: Icy Fortitude, Firebombs, Legacy of Defiance, Calming Branches (%s)', (version) => {
    expect(pool(build(version, 'class.chemist', 'subclass.chemist.cryochemist', 5, { wis: 16 }), 'Icy Fortitude')).toMatchObject({ max: 3, recharge: 'long' });
    expect(feature(build(version, 'class.chemist', 'subclass.chemist.cryochemist', 5, { wis: 16 }), 'Icy Fortitude').rolls[0]!.dice).toBe('8'); // level 5 + Wis 3
    expect(pool(build(version, 'class.chemist', 'subclass.chemist.pyrochemist', 6), 'Firebombs')).toMatchObject({ max: 3, recharge: 'short' });
    expect(pool(build(version, 'class.conqueror', 'subclass.conqueror.will_of_d', 12, { wis: 8 }), 'Legacy of Defiance')).toMatchObject({ max: 1, recharge: 'long' }); // minimum of once
    expect(pool(build(version, 'class.priest', 'subclass.priest.cherry_blossom', 6), 'Calming Branches')).toMatchObject({ max: 3, recharge: 'long' });
  });

  it('v10 only: Six Powers Shave proficiency times a long rest; Drunken Dragon makes 5 beverages; Black Leg Stylish Boost half level rounded up', () => {
    expect(pool(build(V10, 'class.martial_artist', 'subclass.martial_artist.six_powers', 11), 'Shave')).toMatchObject({ max: 4, recharge: 'long' });
    expect(pool(build(V10, 'class.bruiser', 'subclass.bruiser.drunken_dragon', 3), 'Drunken State')).toMatchObject({ max: 5, recharge: 'long' });
    expect(feature(build(V10, 'class.martial_artist', 'subclass.martial_artist.black_leg_style', 5), 'Stylish Boost').rolls[0]).toMatchObject({ dice: '3', kind: 'tempHp' });
  });

  it('v8.8 only: Stylish Boost gives the full level; Devil Bombardier makes proficiency bombs; Firearm Smithing summons its cannon proficiency times', () => {
    expect(feature(build(V88, 'class.martial_artist', 'subclass.martial_artist.black_leg_style', 5), 'Stylish Boost').rolls[0]!.dice).toBe('5');
    expect(pool(build(V88, 'class.devilforged', 'subclass.devilforged.devil_bombardier', 5), 'Devilbomb Creation')).toMatchObject({ max: 3, recharge: 'long' });
    expect(pool(build(V88, 'class.devilforged', 'subclass.devilforged.firearm_smithing', 5), 'Hellfire Artillery')).toMatchObject({ max: 3, recharge: 'long' });
  });
});

describe('choices inside a subclass', () => {
  const pool = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);
  const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name);
  const germa = (version: RulesVersion, power: string, scores: Partial<AbilityScores> = {}, level = 5) =>
    build(version, 'class.hybrid', 'subclass.hybrid.germa', level, scores, [], { choices: { germaSuperpower: [power] } });

  it.each(BOTH)('Germa, Genetic Superpower: nothing chosen adds nothing; an unknown power warns (%s)', (version) => {
    const none = build(version, 'class.hybrid', 'subclass.hybrid.germa', 5);
    expect(none.speed.value).toBe(30);
    expect(feature(none, 'Dengeki Blue')).toBeUndefined();
    expect(germa(version, 'nope').warnings).toHaveLength(1);
  });

  it.each(BOTH)('Germa, Dengeki Blue: walking speed + 10 × proficiency → 30 + 30 = 60 at 5th, 70 at 9th; Lightning Strike 1d6 (%s)', (version) => {
    expect(germa(version, 'dengeki_blue').speed.value).toBe(60);
    expect(germa(version, 'dengeki_blue', {}, 9).speed.value).toBe(70);
    expect(feature(germa(version, 'dengeki_blue'), 'Dengeki Blue')!.rolls[0]).toMatchObject({ dice: '1d6', kind: 'damage' });
  });

  it.each(BOTH)('Germa, Winch Green: Strength + 2 to at most 22, carrying × 8 as Gargantuan; Bionic Strike 1d8 (%s)', (version) => {
    const sheet = germa(version, 'winch_green', { str: 16 });
    expect(sheet.abilities.str.score).toBe(18);
    expect(sheet.ac.value).toBe(13 + 4); // Combat Exoskeleton with the raised Strength
    expect(sheet.carry.value).toBe(18 * 15 * 8);
    expect(germa(version, 'winch_green', { str: 21 }).abilities.str.score).toBe(22);
    expect(feature(sheet, 'Winch Green')!.rolls[0]!.dice).toBe('1d8');
  });

  it.each(BOTH)('Germa, Poison Pink and Stealth Black: Poisonous Kiss proficiency times, Optical Camouflage Dex times (at least once), per long rest (%s)', (version) => {
    const pink = germa(version, 'poison_pink');
    expect(pool(pink, 'Poison Pink')).toMatchObject({ max: 3, recharge: 'long' });
    expect(notes(pink)).toContain('Immune to poison damage and the poisoned condition');
    expect(pool(germa(version, 'stealth_black', { dex: 18 }), 'Stealth Black')).toMatchObject({ max: 4, recharge: 'long' });
    expect(pool(germa(version, 'stealth_black', { dex: 8 }), 'Stealth Black')!.max).toBe(1);
  });

  it.each(BOTH)('Marksman, Rope Master: two tricks at 3rd, three at 7th, four at 15th; each trick 2 × proficiency uses per short rest (%s)', (version) => {
    const rules = loadRules(version);
    const tricks = rules.get('subclass.marksman.rope_master')!.features!.find((f) => f.name === 'Rope Tricks')!;
    const group = rules.get(tricks.choices!.from)!;
    expect((group.options as { name: string }[]).map((o) => o.name)).toEqual(['Whiplash', 'Tether Throw', 'Tripwire', 'Hookshot']);
    const sheet = build(version, 'class.marksman', 'subclass.marksman.rope_master', 5, {}, [], { choices: { ropeTricks: ['whiplash', 'hookshot'] } });
    expect(pool(sheet, 'Whiplash')).toMatchObject({ max: 6, recharge: 'short' });
    expect(pool(sheet, 'Hookshot')).toMatchObject({ max: 6, recharge: 'short' });
    expect(pool(sheet, 'Tripwire')).toBeUndefined();
    expect(pool(sheet, 'Rope Tricks')).toBeUndefined();
    expect(feature(sheet, 'Hookshot')!.action).toBe('bonus');
    expect(tricks.choices!.count).toBe('level>=15 ? 4 : level>=7 ? 3 : 2');
    // The book's paragraphs are still in the feature, word for word.
    for (const option of group.options as { name: string; text: string }[]) expect(tricks.text).toContain(`${option.name}. ${option.text}`);
  });

  it('Devilforged, Mechadevil (v10): two weapon systems at 6th, three at 10th, four at 14th; each proficiency times per short rest with its own dice', () => {
    const sheet = build(V10, 'class.devilforged', 'subclass.devilforged.mechadevil', 6, {}, [], { choices: { mechadevilWeapons: ['railcannon', 'energy_blast'] } });
    expect(pool(sheet, 'Railcannon')).toMatchObject({ max: 3, recharge: 'short' });
    expect(feature(sheet, 'Railcannon')!.rolls[0]!.dice).toBe('6d10');
    expect(feature(sheet, 'Energy Blast')!.rolls[0]!.dice).toBe('6d6');
    expect(feature(sheet, 'Power Fist')).toBeUndefined();
    expect(pool(sheet, 'Mechadevil Mark 2')).toBeUndefined();
  });

  it.each(BOTH)('Chemist, Botany: one land of eight, each with its table of powers (%s)', (version) => {
    const rules = loadRules(version);
    const lands = rules.get(rules.get('subclass.chemist.botany')!.features!.find((f) => f.name === 'Field Invention Powers (Spells)')!.choices!.from)!;
    expect((lands.options as { name: string; tables?: unknown[] }[]).map((o) => [o.name, o.tables?.length])).toEqual(
      ['Arctic', 'Coast', 'Desert', 'Forest', 'Grassland', 'Mountain', 'Swamp', 'Underground'].map((name) => [name, 1]));
    const sheet = build(version, 'class.chemist', 'subclass.chemist.botany', 3, {}, [], { choices: { botanyLand: ['swamp'] } });
    expect(sheet.warnings).toEqual([]);
    expect(feature(sheet, 'Swamp')).toBeDefined();
  });
});

describe('every wired subclass feature', () => {
  it.each(BOTH)('shows its standing resistances and immunities under “In effect” (%s)', (version) => {
    const cases: [string, string, number, string][] = [
      ['class.chemist', 'subclass.chemist.botany', 20, 'immune to poison and disease'],
      ['class.conqueror', 'subclass.conqueror.celestial_doctrine', 20, 'Immune to being charmed or frightened'],
      ['class.priest', 'subclass.priest.sky', 1, 'Resistance to thunder and lightning damage'],
      ['class.priest', 'subclass.priest.infernal', 20, 'Resistance to fire and poison damage'],
      ['class.warrior', 'subclass.warrior.cursed_soul', 20, 'Resistance to psychic damage'],
      ['class.oracle', 'subclass.oracle.bones_of_sight', 20, 'Resistance to necrotic damage'],
    ];
    for (const [classId, subclass, level, words] of cases) {
      expect(notes(build(version, classId, subclass, level)).some((n) => n.includes(words)), `${subclass}: ${words}`).toBe(true);
    }
  });

  it.each(BOTH)('has its effects on a feature of the level the book gives, and every expression works at every level (%s)', (version) => {
    const rules = loadRules(version);
    const subclasses = [...rules.values()].filter((e): e is RuleEntry & { parent: string } => e.kind === 'subclass');
    let wired = 0;
    for (const sub of subclasses) {
      const features = (sub.features ?? []) as { name: string; toggle?: { id: string }; effects?: unknown[]; auto?: string[] }[];
      const toggles = features.flatMap((f) => (f.toggle ? [f.toggle.id] : []));
      if (features.some((f) => f.toggle || (f.effects && !f.auto?.includes('effects')))) wired++;
      for (const level of [1, 3, 6, 11, 20]) {
        const sheet = build(version, sub.parent, sub.id, level, {}, toggles);
        expect(sheet.warnings, `${sub.name} at ${level}`).toEqual([]);
        expect(Number.isFinite(sheet.ac.value) && Number.isFinite(sheet.speed.value) && Number.isFinite(sheet.maxHp.value), sub.name).toBe(true);
      }
    }
    expect(wired).toBeGreaterThanOrEqual(30);
  });

  it.each(BOTH)('gives roll buttons for the dice its text names, never a d20 (%s)', (version) => {
    const rules = loadRules(version);
    let buttons = 0;
    for (const entry of rules.values()) {
      for (const f of (entry.features ?? []) as { name: string; text: string; rolls?: { dice: string; label: string }[]; auto?: string[]; sections?: { text: string }[] }[]) {
        if (!f.auto?.includes('rolls')) continue;
        const text = [f.text, ...(f.sections ?? []).map((s) => s.text)].join(' ');
        for (const roll of f.rolls ?? []) {
          buttons++;
          expect(roll.dice, `${entry.name}: ${f.name}`).not.toMatch(/d20/);
          expect(text, `${entry.name}: ${f.name}`).toContain(roll.dice.split(' + ')[0]!);
        }
      }
    }
    expect(buttons).toBeGreaterThan(50);
  });
});
