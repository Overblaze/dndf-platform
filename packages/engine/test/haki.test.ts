// Haki features, Standard Advancements and Haki Purist on the sheet — p221–241 of each handbook.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, normalizeDoc, puristStamina, setToggle, sheetChanges, surgeAsks, surgeOptions, type AbilityScores, type CharacterDoc, type RulesVersion, type Sheet, type SurgeRecord } from '../src';
import { loadRules } from './load';

const BOTH = ['dndf-10', 'dndf-8.8'] as RulesVersion[];
const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name);
const pool = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);
const took = (...entries: (string | [string, SurgeRecord['pick']])[]): SurgeRecord[] =>
  entries.map((e, i) => (typeof e === 'string' ? { id: `s${i}`, entry: e.includes('.') ? e : `hakiFeature.${e}` } : { id: `s${i}`, entry: `surgeAdvancement.${e[0]}`, pick: e[1] }));

describe.each(BOTH)('Haki and Spirit Surges (%s)', (version) => {
  const rules = loadRules(version);
  const make = (level: number, surges: SurgeRecord[], more: Partial<CharacterDoc> = {}) => {
    const doc: CharacterDoc = { ...newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level, scores }, rules), surges, ...more };
    return { doc, sheet: deriveSheet(doc, rules) };
  };
  const plain = make(8, []).sheet;

  it('every Haki feature and Standard Advancement can go on a sheet without a warning or an unreadable roll', () => {
    const all = [...rules.values()].filter((e) => e.kind === 'hakiFeature' || e.kind === 'surgeAdvancement');
    expect(all.length).toBeGreaterThan(70);
    const { sheet } = make(20, all.map((e, i) => ({ id: `s${i}`, entry: e.id })));
    expect(sheet.warnings).toEqual([]);
    for (const e of all.filter((x) => x.kind === 'hakiFeature' && !x.amateur)) {
      const shown = sheet.features.find((f) => f.key === e.id)!;
      expect(shown, e.name).toBeTruthy();
      expect(shown.text, e.name).toBe(e.text);
      expect(shown.page, e.name).toBe(e.source.page);
      expect(shown.rolls.length, e.name).toBe(((e.rolls ?? []) as unknown[]).length);
      if (e.uses) expect(sheet.resources.some((r) => r.id === `use.${e.id}` && r.max > 0), e.name).toBe(true);
    }
  });

  it('Haki dice grow with Willpower: level 8 is Willpower 8', () => {
    const { sheet } = make(8, took('force_of_will', 'spirit_emission', 'abyssal_hole', 'aura_of_life', 'kings_wrath', 'soul_shield'));
    expect(sheet.willpower.value).toBe(8);
    expect(feature(sheet, 'Force of Will')!.rolls).toEqual([{ label: 'Force damage', kind: 'damage', dice: '3d10' }]); // 1 + quarter of 8
    expect(feature(sheet, 'Spirit Emission')!.rolls[0]!.dice).toBe('6d10'); // 2 + half of 8
    expect(feature(sheet, 'Abyssal Hole')!.rolls[0]!.dice).toBe('8d10'); // Willpower
    expect(feature(sheet, 'Aura of Life')!.rolls).toEqual([{ label: 'Temporary hit points', kind: 'tempHp', dice: '1d6 + 12' }]); // half of 8 + level 8
    expect(feature(sheet, 'King’s Wrath')!.rolls[0]).toMatchObject({ label: 'Psychic damage', dice: '2d8' });
    expect(feature(sheet, 'Soul Shield')!.rolls[0]!.dice).toBe('1d8');
    // quarter of 9, rounded up, is 3
    expect(feature(make(9, took('force_of_will')).sheet, 'Force of Will')!.rolls[0]!.dice).toBe('4d10');
  });

  it('uses come from the wording, and are kept apart from a class feature of the same name', () => {
    const { sheet } = make(8, took('aura_of_life', 'force_of_will', 'soul_shield'));
    expect(pool(sheet, 'Aura of Life')).toMatchObject({ id: 'use.hakiFeature.aura_of_life', max: 3, recharge: 'long' });
    expect(pool(sheet, 'Force of Will')).toMatchObject({ max: 1, recharge: 'short' });
    expect(pool(sheet, 'Soul Shield')).toMatchObject({ max: 1, recharge: 'long' }); // half of proficiency 3, rounded down
    expect(feature(sheet, 'Aura of Life')).toMatchObject({ from: 'Color of Armament · Uncommon', resource: 'use.hakiFeature.aura_of_life' });
  });

  it('Soul Armor: 10 + proficiency + half Willpower, at most 20, only without armor', () => {
    const { doc, sheet } = make(8, took('soul_armor'));
    expect(sheet.ac.value).toBe(plain.ac.value);
    const on = { ...doc, state: setToggle(doc.state, sheet, 'soul_armor', true).state };
    expect(deriveSheet(on, rules).ac.value).toBe(10 + 3 + 4);
    const high = make(20, took('soul_armor'));
    expect(deriveSheet({ ...high.doc, state: setToggle(high.doc.state, high.sheet, 'soul_armor', true).state }, rules).ac.value).toBe(20);
    const armored = { ...on, armor: { name: 'Plate', base: 18, dexCap: 0 } };
    expect(deriveSheet(armored, rules).ac.value).toBe(18);
  });

  it('Dark Armor: Armor Class can’t be less than 5 + Willpower; Clairvoyant Strike adds Willpower to attacks', () => {
    const { doc, sheet } = make(12, took('dark_armor', 'clairvoyant_strike'));
    const dark = deriveSheet({ ...doc, state: { ...doc.state, toggles: { dark_armor: true } } }, rules);
    expect(dark.ac.value).toBe(17);
    expect(dark.ac.lines.at(-1)!.label).toBe('Dark Armor: can’t be less than 17');
    expect(dark.notes.map((n) => n.label)).toContain('Resistance to all types of damage except force');
    const strike = deriveSheet({ ...doc, state: { ...doc.state, toggles: { clairvoyant_strike: true } } }, rules);
    expect(strike.attacks[0]!.toHit.value).toBe(sheet.attacks[0]!.toHit.value + 12);
  });

  it('Enhanced Strike makes a weapon’s own die one size larger, up to d12; Focused Hit up to d8', () => {
    const weapons = [
      { id: 'a', name: 'Dagger', damage: '1d4', damageType: 'piercing', category: 'simple' as const },
      { id: 'b', name: 'Longsword', damage: '1d8', damageType: 'slashing', category: 'martial' as const },
      { id: 'c', name: 'Greatsword', damage: '2d6', damageType: 'slashing', category: 'martial' as const },
      { id: 'd', name: 'Greataxe', damage: '1d12', damageType: 'slashing', category: 'martial' as const },
    ];
    const dice = (sheet: Sheet) => sheet.attacks.slice(1).map((a) => a.damage.split(' ')[0]);
    expect(dice(make(8, [], { weapons }).sheet)).toEqual(['1d4', '1d8', '2d6', '1d12']);
    expect(dice(make(8, took('enhanced_strike'), { weapons }).sheet)).toEqual(['1d6', '1d10', '2d8', '1d12']);
    const amateur = make(4, took('focused_hit'), { weapons }).sheet;
    expect(dice(amateur)).toEqual(['1d6', '1d8', '2d8', '1d12']);
    expect(amateur.attacks[1]!.notes).toContain('Focused Hit: the larger die once per turn; 1d4 otherwise');
    expect(amateur.attacks[2]!.notes).toEqual([]);
  });

  it('an Amateur feature becomes its Uncommon variant at 5th level', () => {
    const at4 = make(4, took('fortitude', 'instinctual_awareness')).sheet;
    expect(feature(at4, 'Fortitude')!.rolls[0]!.dice).toBe('1d4 + 4');
    expect(at4.passivePerception.value).toBe(make(4, []).sheet.passivePerception.value + 2);
    expect(at4.haki.colors.map((c) => [c.count.value, c.tier])).toEqual([[0, 1], [0, 1], [0, 0]]);
    const at5 = make(5, took('fortitude', 'instinctual_awareness')).sheet;
    expect(feature(at5, 'Fortitude')).toBeUndefined();
    expect(feature(at5, 'Aura of Life')).toMatchObject({ from: 'Color of Armament · Uncommon (was Fortitude)' });
    expect(at5.passivePerception.value).toBe(make(5, []).sheet.passivePerception.value + 8);
    expect(at5.haki.colors[0]!.count.value).toBe(1);
  });

  it('tiers: Tier 2 at 4 features of a Color, Tier 3 at 6; a count can be set by hand for Haki from a class', () => {
    const six = ['aura_of_life', 'enhanced_strike', 'soul_armor', 'vessel_of_resilience', 'force_of_will', 'soul_shield'];
    expect(make(8, took(...six.slice(0, 3))).sheet.haki.colors[0]).toMatchObject({ tier: 1, features: six.slice(0, 3).map((id) => `hakiFeature.${id}`) });
    expect(make(8, took(...six.slice(0, 4))).sheet.haki.colors[0]!.tier).toBe(2);
    expect(make(8, took(...six)).sheet.haki.colors.map((c) => c.tier)).toEqual([3, 0, 0]);
    const own = make(8, took('aura_of_life'), { overrides: { 'hakiCount.armament': 4 } }).sheet.haki.colors[0]!;
    expect(own).toMatchObject({ tier: 2, count: { value: 4, calculated: 1, overridden: true } });
  });

  it('skills from King’s Haki are in the totals', () => {
    const { sheet } = make(8, took('voice_of_influence', 'roar_of_the_monarch'));
    for (const id of ['deception', 'persuasion', 'intimidation']) expect(sheet.skills.find((s) => s.id === id)!.proficient, id).toBe(true);
  });

  it('Strengthen Self raises an ability score by 2, to 20 at most', () => {
    const { sheet } = make(8, took(['strengthen_self', { ability: 'str' }], ['strengthen_self', { ability: 'str' }]));
    expect(sheet.abilities.str.score).toBe(plain.abilities.str.score + 4);
    expect(make(8, took(['strengthen_self', { ability: 'str' }]), { scores: { ...scores, str: 19 } }).sheet.abilities.str.score).toBe(20);
    expect(feature(sheet, 'Strengthen Self')!.from).toBe('Spirit Surge: Strength +2');
  });

  it('Career Advancement: proficiency, or expertise when already proficient', () => {
    const before = plain.skills.find((s) => s.id === 'arcana')!;
    expect(before.proficient).toBe(false);
    const once = make(8, took(['career_advancement', { skill: 'arcana' }])).sheet.skills.find((s) => s.id === 'arcana')!;
    const twice = make(8, took(['career_advancement', { skill: 'arcana' }], ['career_advancement', { skill: 'arcana' }])).sheet.skills.find((s) => s.id === 'arcana')!;
    if (rules.has('surgeAdvancement.career_advancement')) {
      expect([once.proficient, once.expertise, once.value]).toEqual([true, false, before.value + 3]);
      expect([twice.expertise, twice.value]).toEqual([true, before.value + 6]);
    } else {
      // v8.8 has no Career Advancement: said, never guessed at.
      expect(once.proficient).toBe(false);
    }
  });

  it('Muscle Memory doubles one feature’s uses; Improve Special Reactions adds one use to each', () => {
    const wind = plain.resources.find((r) => /second wind/i.test(r.name))!;
    const { sheet } = make(8, took(['muscle_memory', { resource: wind.id }], ['improve_special_reactions', {}]));
    expect(sheet.resources.find((r) => r.id === wind.id)!.max).toBe(wind.max * 2);
    const reaction = (s: Sheet) => s.resources.find((r) => r.id.startsWith('sr.'))!.max;
    expect(reaction(sheet)).toBe(reaction(plain) + (rules.has('surgeAdvancement.improve_special_reactions') ? 1 : 0));
  });

  it('Haki Purist: Train Quality rolls one more die, Train Stamina adds a charge', () => {
    const base = make(16, took('force_of_will', 'aura_of_life', 'spirit_emission')).sheet;
    const trained = make(16, took('force_of_will', 'aura_of_life', 'spirit_emission'), { hakiPurist: ['quality', 'stamina', 'stamina'] }).sheet;
    expect(base.haki.purist).toMatchObject({ earned: version === 'dndf-10' ? 3 : 4, picks: [] });
    expect(feature(base, 'Force of Will')!.rolls[0]!.dice).toBe('5d10');
    expect(feature(trained, 'Force of Will')!.rolls[0]!.dice).toBe('6d10');
    expect(pool(trained, 'Force of Will')!.max).toBe(3); // Rare: both picks
    expect(pool(trained, 'Aura of Life')!.max).toBe(pool(base, 'Aura of Life')!.max + 2);
    // Very Rare: only v8.8, and only from a pick taken at 12th level or later (the third pick).
    expect(pool(trained, 'Spirit Emission')!.max).toBe(version === 'dndf-8.8' ? 2 : 1);
    const doc = { rulesVersion: version, classes: [], hakiPurist: ['stamina', 'stamina', 'stamina', 'stamina', 'stamina'] as const };
    expect(['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'].map((r) => puristStamina({ ...doc, hakiPurist: [...doc.hakiPurist] }, r)))
      .toEqual(version === 'dndf-8.8' ? [0, 5, 5, 3, 1] : [0, 5, 5, 0, 0]);
  });

  it('a surge of a given rarity: what is offered, and why the rest is held back', () => {
    const { doc, sheet } = make(8, took('aura_of_life'));
    const context = { tiers: { armament: sheet.haki.colors[0]!.tier, observation: 0, supremeKing: 0 }, spellcaster: false };
    const options = surgeOptions(doc, rules, 'Rare', context);
    const of = (name: string) => options.find((o) => o.entry.name === name)!;
    expect(of('Force of Will')).toMatchObject({ tab: 'armament', blocked: [], taken: 0 });
    expect(of('Aura of Life').blocked).toEqual(['Already taken; it can be chosen once']);
    expect(of('Spirit Emission').blocked).toEqual(['Needs a Very Rare Spirit Surge', 'Needs Tier 2 in this Color (4 features of it)']);
    expect(of('King’s Wrath').blocked).toEqual(['Needs Qualities of a King']);
    expect(of('Fortitude')).toMatchObject({ tab: 'amateur', blocked: ['For characters of level 1–4'] });
    expect(of('Strengthen Self')).toMatchObject({ tab: 'standard', blocked: [] });
    expect(of('Permanent Black Weapon').blocked).toContain('Needs Weapon Hardening');
    const king = surgeOptions({ ...doc, qualitiesOfAKing: true }, rules, 'Legendary', { ...context, tiers: { armament: 3, observation: 3, supremeKing: 3 } });
    expect(king.find((o) => o.entry.name === 'King’s Wrath')!.blocked).toEqual([]);
    expect(king.filter((o) => o.tab === 'armament' && o.blocked.length).map((o) => o.entry.name)).toEqual(['Aura of Life', 'Permanent Black Weapon']);
    expect(surgeAsks(of('Strengthen Self').entry, version)).toEqual([version === 'dndf-10' ? 'abilityOrWillpower' : 'ability']);
  });

  it('an advancement that is not in this handbook is said, and a damaged list still opens', () => {
    expect(make(8, [{ id: 'x', entry: 'hakiFeature.nope' }]).sheet.warnings[0]).toMatch(/not in the/);
    const saved = normalizeDoc({ ...make(8, []).doc, surges: [null, 7, { entry: 'hakiFeature.aura_of_life' }, { id: 'k', entry: 4 }], hakiPurist: ['quality', 'nonsense'], qualitiesOfAKing: 'yes' })!;
    expect(saved.surges).toEqual([{ id: 'surge-1', entry: 'hakiFeature.aura_of_life', pick: undefined }]);
    expect(saved.hakiPurist).toEqual(['quality']);
    expect(saved.qualitiesOfAKing).toBeUndefined();
    expect(normalizeDoc({ ...make(8, []).doc, surges: undefined })!.surges).toBeUndefined();
  });
});

describe('Strengthen Self and Willpower (v10)', () => {
  const rules = loadRules('dndf-10');
  it('+2 Willpower each time it is chosen for Willpower, capped at 20 with levels', () => {
    const doc = { ...newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 8, scores }, rules), surges: took(['strengthen_self', { willpower: true }], ['strengthen_self', { ability: 'con' }]) };
    const sheet = deriveSheet(doc, rules);
    expect(sheet.willpower.value).toBe(10);
    expect(sheet.hakiSaveDc.value).toBe(15);
    expect(sheet.abilities.con.score).toBe(16);
    expect(deriveSheet({ ...doc, willpower: { strengthenSelf: 1 } }, rules).willpower.value).toBe(12);
  });
});

describe('what a surge changes, in words', () => {
  const rules = loadRules('dndf-10');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 8, scores }, rules);
  const diff = (surges: SurgeRecord[]) => sheetChanges(deriveSheet(base, rules), deriveSheet({ ...base, surges }, rules));
  it('lists every number, counter and feature that differs, and nothing else', () => {
    expect(diff([])).toEqual([]);
    expect(diff(took('aura_of_life'))).toEqual(['Color of Armament: no tier → Tier 1', 'New: Aura of Life (Temporary hit points 1d6 + 12)', 'Aura of Life: 3 uses per long rest']);
    expect(diff(took(['strengthen_self', { willpower: true }]))).toEqual(['Willpower: 8 → 10', 'Haki save DC: 14 → 15', 'Haki attack: +6 → +7', 'New: Strengthen Self']);
    expect(diff(took('soul_armor'))).toContain('Soul Armor: a switch on the Combat tab');
    expect(diff(took(['career_advancement', { skill: 'arcana' }]))).toEqual(['Arcana: +0 → +3 (proficient)', 'New: Career Advancement']);
    expect(diff(took(['warriors_path', { proficiency: { kind: 'armor', id: 'shields' } }])).some((l) => /shields/.test(l)) || deriveSheet(base, rules).proficiencies.armor.some((p) => p.id === 'shields')).toBe(true);
  });
});
