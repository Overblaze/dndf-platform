// Racial traits on the sheet: their numbers, uses, dice and pick-lists — p67–82 of each handbook.
import { describe, expect, it } from 'vitest';
import { applyLevelUp, deriveSheet, levelUpPlan, newCharacter, raceChoices, type AbilityScores, type CharacterDoc, type RulesVersion, type Sheet, type TraitDef } from '../src';
import { loadRules } from './load';

const scores: AbilityScores = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name);
const pool = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('racial traits (%s)', (version) => {
  const rules = loadRules(version);
  const make = (raceId: string, level: number, more: Partial<CharacterDoc> = {}, subraceId?: string) => {
    const base = newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level, scores }, rules);
    const doc: CharacterDoc = { ...base, race: { ...base.race, id: raceId, subraceId, name: rules.get(raceId)!.name }, ...more };
    return { doc, sheet: deriveSheet(doc, rules) };
  };
  const human = make('race.human', 5).sheet;

  it('every race and subrace goes on a sheet with each trait’s text, page and readable rolls, and no warnings', () => {
    for (const entry of [...rules.values()].filter((e) => e.kind === 'race' || e.kind === 'subrace')) {
      const raceId = entry.kind === 'race' ? entry.id : String(entry.parent);
      const { sheet } = make(raceId, 20, {}, entry.kind === 'subrace' ? entry.id : undefined);
      expect(sheet.warnings.filter((w) => !/multiclass/i.test(w)), entry.name).toEqual([]);
      for (const trait of (entry.traits ?? []) as (TraitDef & { rolls?: unknown[]; uses?: unknown })[]) {
        if (/^(age|alignment|size|speed|ability score increase|subrace)$/i.test(trait.name)) continue;
        const shown = sheet.features.find((f) => f.key === `${entry.id}/${trait.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`)!;
        expect(shown, `${entry.name} / ${trait.name}`).toBeTruthy();
        expect(shown.text, trait.name).toBe(trait.text);
        expect(shown.page, trait.name).toBe(trait.page);
        expect(shown.rolls.length, trait.name).toBe((trait.rolls ?? []).length);
        if (trait.uses) expect(sheet.resources.some((r) => r.id === shown.resource && r.max > 0), `${entry.name} / ${trait.name} uses`).toBe(true);
      }
    }
  });

  it('Cyborg: Steel Skin is +1 Armor Class, and Cyborg Upgrades is a list to pick from', () => {
    const { doc, sheet } = make('race.cyborg', 5);
    expect(sheet.ac.value).toBe(human.ac.value + 1);
    expect(sheet.ac.lines.at(-1)).toEqual({ label: 'Steel Skin', value: 1 });
    const upgrades = sheet.raceChoices[0]!;
    expect(upgrades).toMatchObject({ id: 'cyborgUpgrades', name: 'Cyborg Upgrades', from: 'Cyborg', picked: [], page: 75 });
    expect(upgrades.options.map((o) => o.name)).toEqual(['Flail Arm', 'Flame Breath', 'Refrigerated Stomach', 'Air Blast', 'Propeller Body', 'Centaur Form', 'Shape-Memory Alloy Body', 'Arsenal Infusion', 'Night Lens', 'Headlights', 'Extended Flail', 'Flamethrower', 'Radical Beam', 'General Cannon', 'Larger Propellers', 'General Form', 'Advanced Shape-Memory Alloy', 'Grand Arsenal']);
    expect(upgrades.options.find((o) => o.id === 'flamethrower')!.requires).toBe('flame_breath');
    // The trait keeps its opening sentence; the options carry the rest, word for word.
    expect(feature(sheet, 'Cyborg Upgrades')!.text).toMatch(/^You install .* of your choice.*:$/);
    expect(upgrades.options[0]!.text).toBe('When you make an unarmed strike or melee weapon attack on your turn that requires your arms to use, you can choose to extend its reach for that attack by 5 feet. You can only use this once on a single melee attack per turn.');
    // How many: v10 gives 2 and one more at 4, 8, 12, 16, 20; v8.8 gives 1 and one more at 5, 10, 15, 20.
    const allowed = [1, 3, 4, 5, 8, 10, 15, 16, 20].map((level) => raceChoices(doc, rules, level)[0]!.allowed);
    expect(allowed).toEqual(version === 'dndf-10' ? [2, 2, 3, 3, 4, 4, 5, 6, 7] : [1, 1, 1, 2, 2, 3, 4, 4, 5]);
  });

  it('picked upgrades are features with their own uses, switches and notes', () => {
    const { doc, sheet } = make('race.cyborg', 5, { choices: { cyborgUpgrades: ['flame_breath', 'flamethrower', 'centaur_form', 'night_lens'] } });
    expect(feature(sheet, 'Flamethrower')).toMatchObject({ from: 'Cyborg: Cyborg Upgrades', page: 75, resource: 'use.optionGroup.cyborg_upgrades/flamethrower' });
    expect(pool(sheet, 'Flamethrower')).toMatchObject({ max: 1, recharge: 'long' });
    expect(pool(sheet, 'Centaur Form')).toMatchObject({ max: 1, recharge: 'short' });
    expect(sheet.notes.map((n) => n.label)).toContain('Darkvision 60 feet');
    const on = deriveSheet({ ...doc, state: { ...doc.state, toggles: { centaur_form: true } } }, rules);
    expect(on.speed.value).toBe(sheet.speed.value + 10);
    expect(make('race.cyborg', 5, { choices: { cyborgUpgrades: ['nonsense'] } }).sheet.warnings).toEqual(['"nonsense" is not one of the Cyborg Upgrades.']);
  });

  it('level-up asks for an upgrade when the level gives another one', () => {
    const { doc } = make('race.cyborg', version === 'dndf-10' ? 3 : 4, { choices: { cyborgUpgrades: version === 'dndf-10' ? ['flail_arm', 'night_lens'] : ['flail_arm'] } });
    const plan = levelUpPlan(doc, rules, 'class.warrior');
    const asked = plan.choices.find((c) => c.id === 'cyborgUpgrades')!;
    expect(asked).toMatchObject({ name: 'Cyborg Upgrades', allowed: version === 'dndf-10' ? 3 : 2 });
    const next = applyLevelUp(doc, rules, { classId: 'class.warrior', hpRoll: null, choices: { cyborgUpgrades: [...asked.have, 'headlights'] } }).doc;
    expect(deriveSheet(next, rules).features.some((f) => f.name === 'Headlights')).toBe(true);
    expect(levelUpPlan(next, rules, 'class.warrior').choices.some((c) => c.id === 'cyborgUpgrades')).toBe(false);
  });

  it('Mink: pick two Animal Characteristics; Tough Hide, Fleet Footed and the natural weapon are in the numbers', () => {
    const plain = make('race.mink', 5).sheet;
    expect(plain.raceChoices[0]).toMatchObject({ id: 'minkCharacteristics', allowed: 2 });
    expect(plain.attacks[0]!.damage.startsWith('1d6')).toBe(true); // unarmed strike, a minimum of 1d6
    const picked = make('race.mink', 5, { choices: { minkCharacteristics: ['tough_hide', 'fleet_footed', 'brute_strength', 'ferocity'] } }).sheet;
    expect(picked.ac.value).toBe(plain.ac.value + 1);
    expect(picked.speed.value).toBe(plain.speed.value + 10);
    expect(picked.skills.find((s) => s.id === 'athletics')!.proficient).toBe(true);
    expect(pool(picked, 'Ferocity')).toMatchObject({ max: 1, recharge: 'short' });
    const heavy = make('race.mink', 5, { choices: { minkCharacteristics: ['tough_hide'] }, armor: { name: 'Plate', base: 18, dexCap: 0 } }).sheet;
    expect(heavy.ac.value).toBe(18);
  });

  it('Buccaneer: Sturdy Build is 13 + Constitution without armor, and Anchor Throw grows at 5, 11 and 17', () => {
    const { sheet } = make('race.buccaneer', 11);
    expect(sheet.ac.value).toBe(13 + 2);
    expect(feature(sheet, 'Anchor Throw')!.rolls[0]).toMatchObject({ dice: '3d12' });
    expect(pool(sheet, 'Anchor Throw')).toMatchObject({ max: 1, recharge: 'short' });
    expect(feature(make('race.buccaneer', 4).sheet, 'Anchor Throw')!.rolls[0]!.dice).toBe('1d12');
  });
});

describe('racial traits only in v10', () => {
  const rules = loadRules('dndf-10');
  const make = (raceId: string, subraceId: string | undefined, level = 5) => {
    const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level, scores }, rules);
    return deriveSheet({ ...base, race: { ...base.race, id: raceId, subraceId, name: 'x' } }, rules);
  };
  const human = make('race.human', undefined);
  it('+1 Armor Class traits, natural armor, the Tontatta’s hit points, bites and once-per-rest traits', () => {
    expect(make('race.fishman', 'subrace.fishman.fighting_fish').ac.value).toBe(human.ac.value + 1);
    expect(make('race.dwarf', 'subrace.dwarf.automata').ac.value).toBe(human.ac.value + 1);
    expect(make('race.void_century_automaton', undefined).ac.value).toBe(15 + 1);
    const tontatta = make('race.dwarf', 'subrace.dwarf.tontatta_tribe');
    expect(tontatta.maxHp.value).toBe(human.maxHp.value - 10);
    expect(tontatta.maxHp.lines.at(-1)).toEqual({ label: 'Glass Cannon', value: -10 });
    expect(['stealth', 'acrobatics'].map((id) => tontatta.skills.find((s) => s.id === id)!.proficient)).toEqual([true, true]);
    const shark = make('race.fishman', 'subrace.fishman.shark');
    expect(shark.features.find((f) => f.name === 'Bite')!.rolls[0]).toMatchObject({ dice: '1d6 + 3', kind: 'damage' });
    const wotan = make('race.fish_man_wotan', undefined);
    expect(wotan.features.find((f) => f.name === 'Wotan Vigor')!.rolls[0]).toMatchObject({ dice: '1d12 + 2', kind: 'heal' });
    expect(wotan.resources.find((r) => r.name === 'Wotan Vigor')).toMatchObject({ max: 1, recharge: 'long' });
    const yeti = make('race.yeti', undefined);
    expect(yeti.features.find((f) => f.name === 'Glacial Grasp')!.displays).toEqual([{ label: 'Save DC', value: '14' }]);
    expect(yeti.resources.find((r) => r.name === 'Glacial Grasp')!.max).toBe(3);
  });
});
