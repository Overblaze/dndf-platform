// Racial traits on the sheet: their numbers, uses, dice and pick-lists — p67–82 of each handbook.
import { describe, expect, it } from 'vitest';
import { applyLevelUp, deriveSheet, levelUpPlan, newCharacter, raceChoices, racePickLabel, racePickOptions, speedLine, toolSuggestions, type AbilityScores, type CharacterDoc, type RulesVersion, type OptionDef, type Sheet, type TraitDef } from '../src';
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

// Swimming, flying, climbing and burrowing speeds, and the choices a trait leaves to the player.
describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('racial speeds and choices (%s)', (version) => {
  const rules = loadRules(version);
  const make = (raceId: string, level: number, more: Partial<CharacterDoc> = {}, subraceId?: string) => {
    const base = newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level, scores }, rules);
    const doc: CharacterDoc = { ...base, race: { ...base.race, id: raceId, subraceId, name: rules.get(raceId)!.name, speed: Number(rules.get(raceId)!.speed ?? 30) }, ...more };
    return { doc, sheet: deriveSheet(doc, rules) };
  };
  const moves = (sheet: Sheet) => Object.fromEntries(sheet.speeds.map((s) => [s.mode, s.stat.value]));
  const skilled = (sheet: Sheet, id: string) => sheet.skills.find((k) => k.id === id)!.proficient;

  it('a character with no such trait has only a walking speed', () => {
    expect(make('race.human', 5).sheet.speeds).toEqual([]);
    expect(speedLine(make('race.human', 5).sheet)).toBe('30 ft');
  });

  it('Cyborg: Propeller Body is a swimming speed of 25 feet, Larger Propellers a flying speed of 10', () => {
    expect(make('race.cyborg', 5).sheet.speeds).toEqual([]);
    const { doc, sheet } = make('race.cyborg', 5, { choices: { cyborgUpgrades: ['propeller_body'] } });
    expect(moves(sheet)).toEqual({ swim: 25 });
    expect(sheet.speeds[0]).toMatchObject({ mode: 'swim', from: 'Propeller Body', stat: { key: 'speed.swim', label: 'Swim speed', value: 25, lines: [{ label: 'Propeller Body', value: 25 }], page: 75 } });
    expect(sheet.notes.some((n) => /swimming speed/i.test(n.label))).toBe(false); // no longer only a note
    expect(moves(make('race.cyborg', 5, { choices: { cyborgUpgrades: ['propeller_body', 'larger_propellers'] } }).sheet)).toEqual({ swim: 25, fly: 10 });
    expect(speedLine(make('race.cyborg', 5, { choices: { cyborgUpgrades: ['propeller_body', 'larger_propellers'] } }).sheet)).toBe('30 ft, swim 25 ft, fly 10 ft');
    // The player's own number wins, with the calculated one kept.
    const own = deriveSheet({ ...doc, overrides: { 'speed.swim': 40 } }, rules).speeds[0]!.stat;
    expect(own).toMatchObject({ value: 40, calculated: 25, overridden: true });
  });

  it('what slows walking slows the others: exhaustion halves, a condition that stops you stops them', () => {
    const { doc } = make('race.cyborg', 5, { choices: { cyborgUpgrades: ['propeller_body'] } });
    expect(moves(deriveSheet({ ...doc, state: { ...doc.state, exhaustion: 2 } }, rules))).toEqual({ swim: 12 });
    expect(moves(deriveSheet({ ...doc, state: { ...doc.state, exhaustion: 5 } }, rules))).toEqual({ swim: 0 });
    expect(moves(deriveSheet({ ...doc, state: { ...doc.state, conditions: ['Grappled'] } }, rules))).toEqual({ swim: 0 });
  });

  it('Fishman and Mink: the speeds their traits and subraces give, the faster of two', () => {
    expect(moves(make('race.fishman', 3).sheet)).toEqual({ swim: 35 });
    expect(moves(make('race.fishman', 3, {}, 'subrace.fishman.cookiecutter').sheet)).toEqual({ swim: 35, burrow: 30 });
    expect(moves(make('race.fishman', 3, {}, 'subrace.fishman.manta_ray').sheet)).toEqual({ swim: 40 }); // Sea Glide's 40 over the Fishman's 35
    expect(moves(make('race.fish_man_wotan', 3).sheet)).toEqual({ swim: 35 });
    expect(moves(make('race.mink', 3).sheet)).toEqual({ climb: 20 });
    const picks = version === 'dndf-10' ? 'minkCharacteristics' : 'minkCharacteristics';
    const nimble = make('race.mink', 3, { choices: { [picks]: ['nimble_climber', 'good_swimmer'] } }).sheet;
    expect(moves(nimble)).toEqual({ swim: 30, climb: 30 }); // equal to walking speed, which beats Beast’s Slash's 20
    expect(nimble.speeds.find((s) => s.mode === 'climb')!.stat.lines).toEqual([{ label: 'Nimble Climber: equal to walking speed', value: 30 }]);
    // …and follows it: Fleet Footed adds 10 feet of walking speed.
    expect(moves(make('race.mink', 3, { choices: { [picks]: ['nimble_climber', 'fleet_footed'] } }).sheet)).toEqual({ climb: 40 });
  });

  it('Merfolk walk 10 feet until level 5, then 30, and swim 50; Lunarians fly 50, not in medium or heavy armor', () => {
    expect(make('race.merfolk', 4).sheet.speed.value).toBe(10);
    expect(make('race.merfolk', 5).sheet.speed).toMatchObject({ value: 30, lines: [{ label: 'Merfolk', value: 10 }, { label: 'Merfolk', value: 20 }] });
    expect(moves(make('race.merfolk', 4).sheet)).toEqual({ swim: 50 });
    const lunarian = make('race.lunarian', 3).sheet.speeds;
    expect(lunarian).toHaveLength(1);
    expect(lunarian[0]).toMatchObject({ mode: 'fly', from: 'Flight', note: 'Not while wearing medium or heavy armor', stat: { value: 50 } });
    const winged = make('race.sky_islander', 3, {}, 'subrace.sky_islander.merveillians').sheet.speeds;
    expect(winged[0]).toMatchObject({ mode: 'fly', stat: { value: 30 }, note: 'Not while wearing medium or heavy armor' });
  });

  it('Cyborg: Shape-Memory Alloy Body asks for a skill and a tool, and what is chosen is a proficiency', () => {
    expect(make('race.cyborg', 5).sheet.racePicks).toEqual([]);
    const bare = make('race.cyborg', 5, { choices: { cyborgUpgrades: ['shape_memory_alloy_body'] } }).sheet;
    expect(bare.racePicks.map((p) => [p.key, p.from, p.def.kind, p.def.count, p.picked])).toEqual([
      ['pick.cyborgUpgrades.shape_memory_alloy_body.skill', 'Shape-Memory Alloy Body', 'skill', 1, []],
      ['pick.cyborgUpgrades.shape_memory_alloy_body.tool', 'Shape-Memory Alloy Body', 'tool', 1, []],
    ]);
    expect(racePickOptions(bare.racePicks[0]!)).toHaveLength(18);
    expect(skilled(bare, 'stealth')).toBe(false);
    const choices = { cyborgUpgrades: ['shape_memory_alloy_body'], 'pick.cyborgUpgrades.shape_memory_alloy_body.skill': ['stealth'], 'pick.cyborgUpgrades.shape_memory_alloy_body.tool': ['Navigator’s tools'] };
    const chosen = make('race.cyborg', 5, { choices }).sheet;
    expect(skilled(chosen, 'stealth')).toBe(true);
    expect(chosen.proficiencies.tools).toContainEqual(expect.objectContaining({ name: 'Navigator’s tools', from: 'Shape-Memory Alloy Body' }));
    expect(chosen.racePicks[0]!.picked).toEqual(['stealth']);
    expect(racePickLabel(chosen.racePicks[0]!, 'stealth')).toBe('Stealth');
    expect(chosen.warnings).toEqual([]);
    // The upgrade swapped out: what it gave goes with it, and comes back if it is taken again.
    const swapped = make('race.cyborg', 5, { choices: { ...choices, cyborgUpgrades: ['night_lens'] } }).sheet;
    expect(swapped.racePicks).toEqual([]);
    expect(skilled(swapped, 'stealth')).toBe(false);
    expect(swapped.proficiencies.tools.some((t) => t.name === 'Navigator’s tools')).toBe(false);
    // The upgrade of the upgrade gives one skill more.
    const advanced = make('race.cyborg', 5, { choices: { ...choices, cyborgUpgrades: ['shape_memory_alloy_body', 'advanced_shape_memory_alloy'], 'pick.cyborgUpgrades.advanced_shape_memory_alloy.skill': ['arcana'] } }).sheet;
    expect(advanced.racePicks).toHaveLength(3);
    expect(skilled(advanced, 'arcana') && skilled(advanced, 'stealth')).toBe(true);
  });

  it('the other races’ choices: a skill from two, a skill or a tool, tools, weapons', () => {
    const variant = make('race.human', 1, { choices: { 'pick.subrace.human.variant.skills.skill': ['insight'] } }, 'subrace.human.variant').sheet;
    expect(variant.racePicks.map((p) => p.from)).toEqual(['Skills']);
    expect(skilled(variant, 'insight')).toBe(true);
    const smelt = make('race.fishman', 1, {}, 'subrace.fishman.smelt_whiting').sheet.racePicks[0]!;
    expect(racePickOptions(smelt)).toEqual([{ id: 'deception', name: 'Deception' }, { id: 'persuasion', name: 'Persuasion' }]);
    const octopus = make('race.fishman', 1, { choices: { 'pick.subrace.fishman.octopus.deadly_precision.proficiency': ['tool:Weaver’s tools'] } }, 'subrace.fishman.octopus').sheet;
    expect(octopus.racePicks[0]!.def).toMatchObject({ from: ['sleight_of_hand'], orTool: 'Artisan’s tool' });
    expect(octopus.proficiencies.tools).toContainEqual(expect.objectContaining({ name: 'Weaver’s tools', from: 'Deadly Precision' }));
    expect(skilled(octopus, 'sleight_of_hand')).toBe(false);
    // "A tool instead", with the tool not yet named, is nothing chosen.
    expect(make('race.fishman', 1, { choices: { 'pick.subrace.fishman.octopus.deadly_precision.proficiency': ['tool:'] } }, 'subrace.fishman.octopus').sheet.proficiencies.tools.filter((t) => t.from === 'Deadly Precision')).toEqual([]);
    const yokai = make('race.yokai_tribesman', 1, { choices: { 'pick.race.yokai_tribesman.crafty.tool': ['Shamisen'] } }).sheet;
    expect(yokai.proficiencies.tools).toContainEqual(expect.objectContaining({ name: 'Shamisen', from: 'Crafty' }));
    const oni = make('race.oni', 1, { choices: { 'pick.race.oni.warriors_heritage.weapons': ['Kanabo', 'Longsword'] } }).sheet;
    expect(oni.racePicks[0]!.def).toMatchObject({ kind: 'weapon', count: 2 });
    expect(oni.proficiencies.weapons.filter((w) => w.from === 'Warrior’s Heritage').map((w) => w.id)).toEqual(['kanabo', 'longsword']);
    const automata = make('race.dwarf', 1, {}, 'subrace.dwarf.automata').sheet;
    expect(automata.racePicks.map((p) => p.def.kind)).toEqual(['skill', 'weapon']);
  });

  it('no racial trait or option names a speed or a proficiency “of your choice” that the sheet does not take up', () => {
    // Read from the wording, not from the list of traits that were annotated.
    const speedWords = /(swimming|flying|climbing|burrow) speed (of \d+|equal to your walking speed)|a burrow speed of \d+/i;
    const choiceWords = /proficien\w+[^.]*\b(of your choice|\(your choice\))|\bSkill of your choice|martial weapons of your choice/i;
    const owners: { where: string; text: string; effects?: { type: string }[]; picks?: unknown[] }[] = [];
    for (const entry of rules.values()) {
      if (entry.kind === 'race' || entry.kind === 'subrace') for (const trait of (entry.traits ?? []) as TraitDef[]) owners.push({ where: `${entry.name} / ${trait.name}`, ...(trait as object) } as (typeof owners)[number]);
      if (entry.kind === 'optionGroup' && /^race\./.test(String(entry.parent))) for (const option of (entry.options ?? []) as OptionDef[]) owners.push({ where: `${entry.name} / ${option.name}`, ...(option as object) } as (typeof owners)[number]);
    }
    expect(owners.length).toBeGreaterThan(150);
    const missedSpeed = owners.filter((o) => speedWords.test(o.text) && !(o.effects ?? []).some((e) => e.type === 'movement')).map((o) => o.where);
    const missedChoice = owners.filter((o) => choiceWords.test(o.text) && !o.picks?.length).map((o) => o.where);
    expect(missedSpeed).toEqual([]);
    expect(missedChoice).toEqual([]);
    expect(owners.filter((o) => speedWords.test(o.text)).length).toBeGreaterThanOrEqual(5);
  });
});

// "Your speed increases" is every speed; "your walking speed increases" is walking alone.
describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('speed bonuses and the other speeds (%s)', (version) => {
  const rules = loadRules(version);
  const build = (classId: string, raceId: string, more: Partial<CharacterDoc> = {}, subraceId?: string) => {
    const base = newCharacter({ name: 'T', rulesVersion: version, classId, level: 5, scores }, rules);
    const doc: CharacterDoc = { ...base, race: { ...base.race, id: raceId, subraceId, name: rules.get(raceId)!.name, speed: Number(rules.get(raceId)!.speed ?? 30) }, ...more };
    return deriveSheet(doc, rules);
  };
  const moves = (sheet: Sheet) => Object.fromEntries(sheet.speeds.map((s) => [s.mode, s.stat.value]));
  const propeller = { choices: { cyborgUpgrades: ['propeller_body'] } };

  it('Bruiser, Offensive Defense: +10 feet to a Cyborg’s Propeller Body swimming speed as well as to walking', () => {
    const sheet = build('class.bruiser', 'race.cyborg', propeller);
    expect(sheet.speed.value).toBe(40);
    expect(moves(sheet)).toEqual({ swim: 35 });
    expect(sheet.speeds[0]!.stat.lines).toEqual([{ label: 'Propeller Body', value: 25 }, { label: 'Offensive Defense', value: 10 }]);
    expect(speedLine(sheet)).toBe('40 ft, swim 35 ft');
    // In armor Offensive Defense gives nothing, to either.
    const armored = build('class.bruiser', 'race.cyborg', { ...propeller, armor: { name: 'Leather', base: 11, dexCap: null } });
    expect([armored.speed.value, moves(armored).swim]).toEqual([30, 25]);
    // Another class has no such bonus.
    expect(moves(build('class.warrior', 'race.cyborg', propeller))).toEqual({ swim: 25 });
  });

  it('the Mobile feat’s "your speed increases by 10 feet" reaches a Fishman’s swimming speed', () => {
    const sheet = build('class.warrior', 'race.fishman', { feats: ['feat.mobile'] });
    expect([sheet.speed.value, moves(sheet).swim]).toEqual([40, 45]);
  });

  it('a bonus to walking speed alone leaves the others be', () => {
    // Fleet Footed: "Your base walking speed increases by 10 feet". Beast’s Slash's climbing speed stays 20.
    const mink = build('class.warrior', 'race.mink', { choices: { minkCharacteristics: ['fleet_footed'] } });
    expect([mink.speed.value, moves(mink).climb]).toEqual([40, 20]);
  });

  it('a speed equal to the walking speed is not raised twice', () => {
    // Walking 30 + 10 (Offensive Defense) = 40; Nimble Climber is "equal to your walking speed": 40, not 50.
    const sheet = build('class.bruiser', 'race.mink', { choices: { minkCharacteristics: ['nimble_climber'] } });
    expect([sheet.speed.value, moves(sheet).climb]).toEqual([40, 40]);
    expect(sheet.speeds[0]!.stat.lines).toEqual([{ label: 'Nimble Climber: equal to walking speed', value: 40 }]);
  });

  it('every speed bonus in the data is marked by what its own sentence says', () => {
    // Read from the wording: a bonus is "walking" exactly when the sentence that gives it says "walking speed".
    const found: { name: string; walking: boolean; sentence: string }[] = [];
    const visit = (node: unknown, owner?: { name: string; text: string }) => {
      if (Array.isArray(node)) return node.forEach((child) => visit(child, owner));
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      const own = typeof record.name === 'string' && typeof record.text === 'string' ? (record as { name: string; text: string }) : owner;
      if (record.type === 'speed' && own) {
        const sentence = own.text.split(/(?<=[.!?])\s+|\n/).filter((s) => /speed (increases|is reduced|becomes)/i.test(s)).join(' ');
        found.push({ name: own.name, walking: record.walking === true, sentence });
      }
      for (const [key, value] of Object.entries(record)) if (key !== 'text') visit(value, own);
    };
    for (const entry of rules.values()) visit(entry, typeof entry.text === 'string' ? { name: entry.name, text: entry.text } : undefined);
    expect(found.length).toBeGreaterThanOrEqual(8);
    for (const bonus of found) {
      expect(bonus.sentence, bonus.name).not.toBe('');
      expect(bonus.walking, `${bonus.name}: ${bonus.sentence}`).toBe(/walking speed (increases|becomes)/i.test(bonus.sentence));
    }
    expect(found.filter((b) => !b.walking).map((b) => b.name)).toEqual(expect.arrayContaining(['Offensive Defense', 'Mobile', 'Unarmored Movement']));
  });
});

// Tool proficiencies from a class, a background and crew roles.
describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('tool proficiencies (%s)', (version) => {
  const rules = loadRules(version);
  const build = (classId: string, more: Partial<CharacterDoc> = {}) => deriveSheet({ ...newCharacter({ name: 'T', rulesVersion: version, classId, level: 3, scores }, rules), ...more }, rules);
  const tools = (sheet: Sheet) => sheet.proficiencies.tools.map((t) => `${t.name} <${t.from}>`);

  it('a background’s named tools are on the sheet, and its "of your choice" ones are asked for', () => {
    expect(tools(build('class.warrior'))).toEqual([]);
    const pirate = build('class.warrior', { background: { id: 'background.pirate' } });
    expect(tools(pirate)).toEqual(['Navigator’s tools <Pirate (background)>', 'Carpenter’s tools <Pirate (background)>']);
    expect(pirate.racePicks).toEqual([]);
    const sage = build('class.warrior', { background: { id: 'background.sage' } });
    expect(tools(sage)).toEqual(['Cartographer’s Tools <Sage (background)>']);
    expect(sage.racePicks.map((p) => [p.key, p.race, p.def.kind, p.def.count, p.def.label])).toEqual([['pick.background.sage.tool1', 'Sage background', 'tool', 1, 'one set of Artisan’s Tools of your choice']]);
    const chosen = build('class.warrior', { background: { id: 'background.sage' }, choices: { 'pick.background.sage.tool1': ['Painter’s supplies'] } });
    expect(tools(chosen)).toEqual(['Cartographer’s Tools <Sage (background)>', 'Painter’s supplies <Sage background>']);
    // Two to choose, counted from the book's words.
    expect(build('class.warrior', { background: { id: 'background.noble' } }).racePicks[0]!.def).toMatchObject({ count: 2, label: 'Two types of gaming sets' });
  });

  it('crew roles give their tools, every role held', () => {
    const sheet = build('class.warrior', { crewRoles: [{ id: 'crewRole.navigator' }, { id: 'crewRole.shipwright' }, { id: 'crewRole.captain' }] });
    expect(tools(sheet)).toEqual(['Cartographer’s tools <Navigator (crew role)>', 'Navigator’s tools <Navigator (crew role)>', 'Carpenter’s tools <Shipwright (crew role)>', 'Woodcarver’s tools <Shipwright (crew role)>']);
    expect(tools(build('class.warrior', { crewRoles: [{ id: 'crewRole.doctor' }] }))).toEqual(['Herbalism kit <Doctor (crew role)>', 'Brewer’s supplies <Doctor (crew role)>', 'Alchemist’s supplies <Doctor (crew role)>']);
    expect(tools(build('class.warrior', { crewRoles: [{ id: 'crewRole.helmsman' }] }))).toEqual(['Vehicles (water) <Helmsman (crew role)>']);
  });

  it('a class’s named tools are listed and its choices asked for, not shown as a sentence', () => {
    const tinkerer = build('class.tinkerer');
    expect(tools(tinkerer)).toEqual(['Thieves’ tools <Tinkerer>', 'Tinker’s tools <Tinkerer>']);
    expect(tinkerer.racePicks.map((p) => [p.key, p.def.count])).toEqual([['pick.class.tinkerer.tool1', 2]]);
    const chosen = build('class.tinkerer', { choices: { 'pick.class.tinkerer.tool1': ['Smith’s tools', 'Tinker’s tools'] } });
    // One the class gives anyway is not listed twice.
    expect(tools(chosen)).toEqual(['Thieves’ tools <Tinkerer>', 'Tinker’s tools <Tinkerer>', 'Smith’s tools <Tinkerer>']);
    expect(tools(build('class.conqueror'))).toEqual([]);
    expect(build('class.conqueror').racePicks.map((p) => p.def.label)).toEqual(['One tool of your choice']);
  });

  it('the same tool from two places is one proficiency, whatever its capitals', () => {
    const sheet = build('class.warrior', { background: { id: 'background.pirate' }, crewRoles: [{ id: 'crewRole.navigator' }, { id: 'crewRole.shipwright' }] });
    expect(sheet.proficiencies.tools.map((t) => t.name)).toEqual(['Navigator’s tools', 'Carpenter’s tools', 'Cartographer’s tools', 'Woodcarver’s tools']);
  });

  it('no class, background or crew role names a tool the sheet leaves out', () => {
    // Counted from the book's own lines, not from the parsed lists.
    const said = (text: string) => text.replace(/\.$/, '').split(/,\s*(?:and\s+)?|\s+and\s+|\.\s+/).map((part) => part.trim()).filter(Boolean);
    let checked = 0;
    for (const entry of rules.values()) {
      const parsed = entry.kind === 'class' ? { fixed: ((entry.proficiencies as { tools?: string[]; toolPicks?: { label: string }[] }).tools ?? []).filter((t) => !(entry.proficiencies as { toolPicks?: { label: string }[] }).toolPicks?.some((p) => p.label === t)), picks: (entry.proficiencies as { toolPicks?: { label: string; count: number }[] }).toolPicks ?? [] }
        : (entry.tools as { fixed?: string[]; picks?: { label: string; count: number }[] } | undefined);
      const line = entry.kind === 'background' ? String(entry.toolProficiencies ?? '') : entry.kind === 'class' ? ((entry.proficiencies as { tools?: string[] }).tools ?? []).join(', ') : '';
      if (entry.kind !== 'background' && entry.kind !== 'class') continue;
      const parts = said(line);
      expect((parsed?.fixed?.length ?? 0) + (parsed?.picks?.length ?? 0), `${entry.name}: ${line}`).toBe(parts.length);
      for (const pick of parsed?.picks ?? []) expect(pick.count, `${entry.name}: ${pick.label}`).toBe(/\b(two)\b/i.test(pick.label) ? 2 : /\bthree\b/i.test(pick.label) ? 3 : 1);
      checked += parts.length ? 1 : 0;
    }
    expect(checked).toBeGreaterThanOrEqual(35);
    // Crew roles: every tool, kit or vehicle named in a role's proficiency sentence is granted.
    for (const role of [...rules.values()].filter((e) => e.kind === 'crewRole')) {
      const sentence = ((role.sections ?? []) as { name: string; text: string }[]).find((s) => s.name === 'Role Skill Proficiency')?.text ?? '';
      const named = sentence.match(/[A-Z][\w’]+(?:’s)? (?:tools|supplies|utensils|kits?)|Vehicles \(\w+\)/g) ?? [];
      expect(((role.tools as { fixed?: string[] } | undefined)?.fixed ?? []).length, `${role.name}: ${sentence}`).toBe(named.length);
    }
  });

  it('suggests tools by what the choice says', () => {
    expect(toolSuggestions('Two types of gaming sets')).toEqual(['Dice set', 'Playing card set']);
    expect(toolSuggestions('One type of gaming set or Thieves’ Tools')).toEqual(['Dice set', 'Playing card set', 'Thieves’ tools']);
    expect(toolSuggestions('one type of musical instrument')).toContain('Lute');
    expect(toolSuggestions('One type of artisan’s tools or musical instrument')).toEqual(expect.arrayContaining(['Smith’s tools', 'Flute']));
    expect(toolSuggestions('Two of your choice').length).toBeGreaterThan(30);
  });
});
