// A Devil Fruit infused into a weapon instead of eaten: the Devilforged's Infuse Devil Fruit (v8.8 p114–115).
// The fruits here are stand-ins made for the test; no real fruit is in the repository.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, biggerDie, cleanBeast, deriveSheet, infusionBenefits, infusionCharges, infusionFeature, infusionNumbers, infusionSection, infusionTypeOf, infusionTypes,
  newCharacter, normalizeDoc, parseBeast, withWeaponDamage, type AbilityScores, type CharacterDoc, type RuleEntry, type RulesVersion, type Secrets,
} from '../src';
import { loadRules } from './load';

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 16 };
const fruit = (type: string, rarity = 'Rare', more: Partial<RuleEntry> = {}): RuleEntry => ({
  id: `devilFruit.${type.toLowerCase().replace(/\W+/g, '_')}`, kind: 'devilFruit', name: `Stand-in ${type}`, versions: [], source: { book: 'Test Fruit Book', page: 12 },
  rarity, type, appearance: 'A striped pear.', description: 'A test fruit.', seaWeakness: 'Cannot swim.',
  features: [{ name: 'Test Burst', text: 'As an action you deal 2d8 fire damage.', page: 13 }, { name: 'Test Trait', text: 'You can do a test thing.', page: 13 }] as never,
  spells: { name: 'Test Spells', text: 'You can cast test spells with charges.', page: 14 },
  awakening: { name: 'Test Awakening', text: 'Once per day you deal 10d10 force damage.', page: 14 },
  ...more,
});
const GRANT = '11111111-2222-4333-8444-555555555555';
const granted = (entry: RuleEntry, id = GRANT): Secrets => ({ granted: [{ id, key: `${entry.id}@test`, kind: 'owner', revealed: false, entry }], advancements: [] });

describe('the infusion rules as the v8.8 handbook prints them', () => {
  const rules = loadRules('dndf-8.8');
  const { feature } = infusionFeature(rules)!;
  const types = infusionTypes(feature);

  it('arrives at 3rd level in v8.8 and at 1st in v10', () => {
    expect(feature.level).toBe(3);
    expect(infusionFeature(loadRules('dndf-10'))!.feature.level).toBe(1);
  });

  it('has a section for eight types of fruit', () => {
    expect(types).toEqual(['Body Enhancer Paramecia', 'Environment Altering Paramecia', 'Substance Generator Paramecia', 'Special Paramecia', 'Zoan', 'Gaseous Logia', 'Liquid Logia', 'Solid Logia']);
  });

  it('reads a fruit’s own type line, however the books spell it', () => {
    const of = (line: string) => infusionTypeOf(line, types);
    expect(of('Body Enhancer Paramecia')).toBe('Body Enhancer Paramecia');
    expect(of('Body Enahncer Paramecia')).toBe('Body Enhancer Paramecia'); // as one book misprints it
    expect(of('Environment Alterer Paramecia')).toBe('Environment Altering Paramecia');
    expect(of('Environemnt Alterer Paramecia')).toBe('Environment Altering Paramecia');
    expect(of('Environment Altering Paramecia')).toBe('Environment Altering Paramecia');
    expect(of('Substance Producer Paramecia')).toBe('Substance Generator Paramecia');
    expect(of('Special Paramecia')).toBe('Special Paramecia');
    for (const zoan of ['Standard Zoan', 'Ancient Zoan', 'Mythical Zoan', 'Infernal Zoan', 'Special Zoan', 'Artificial Zoan']) expect(of(zoan), zoan).toBe('Zoan');
    expect([of('Gaseous Logia'), of('Liquid Logia'), of('Solid Logia')]).toEqual(['Gaseous Logia', 'Liquid Logia', 'Solid Logia']);
    // v8.8 prints no infusion for a Special Logia; v10 does.
    expect(of('Special Logia')).toBeNull();
    expect(infusionTypeOf('Special Logia', infusionTypes(infusionFeature(loadRules('dndf-10'))!.feature))).toBe('Special Logia');
    expect(of('Paramecia')).toBeNull();
    expect(of('')).toBeNull();
  });

  it('gives each type the numbers its own words give, and no others', () => {
    const numbers = (type: string, rarity = 'Rare') => infusionNumbers(infusionSection(feature, type)!, rarity);
    expect(numbers('Body Enhancer Paramecia')).toEqual({ dieStep: true, strikes: 2, elemental: null, reach: 0, splash: null, spells: false, effectBenefit: 'Fruit Effect', companion: false });
    expect(numbers('Environment Altering Paramecia')).toEqual({ dieStep: false, strikes: 0, elemental: null, reach: 0, splash: null, spells: true, effectBenefit: 'Fruit Effect', companion: false });
    expect(numbers('Substance Generator Paramecia')).toEqual({ dieStep: false, strikes: 0, elemental: null, reach: 0, splash: null, spells: true, effectBenefit: 'Substance Generation', companion: false });
    expect(numbers('Special Paramecia')).toEqual({ dieStep: false, strikes: 0, elemental: '1d6', reach: 0, splash: null, spells: true, effectBenefit: 'Fruit Effect', companion: false });
    expect(numbers('Zoan', 'Legendary')).toEqual({ dieStep: false, strikes: 4, elemental: null, reach: 5, splash: null, spells: false, effectBenefit: null, companion: true });
    expect(numbers('Gaseous Logia')).toEqual({ dieStep: false, strikes: 0, elemental: '1d6', reach: 10, splash: null, spells: true, effectBenefit: null, companion: false });
    expect(numbers('Liquid Logia')).toEqual({ dieStep: false, strikes: 0, elemental: '1d6', reach: 0, splash: null, spells: true, effectBenefit: 'Fruit Effect', companion: false });
    expect(numbers('Solid Logia')).toEqual({ dieStep: false, strikes: 0, elemental: '1d6', reach: 0, splash: '1d6', spells: true, effectBenefit: null, companion: false });
    // "Starting with uncommon": +1, +2, +3, +4.
    expect(['Uncommon', 'Rare', 'Very Rare', 'Legendary'].map((r) => numbers('Zoan', r).strikes)).toEqual([1, 2, 3, 4]);
    expect(numbers('Zoan', 'Unheard-of').strikes).toBe(0);
  });

  it('names each section’s benefits as the book leads them', () => {
    expect(infusionBenefits(infusionSection(feature, 'Body Enhancer Paramecia')!).map((b) => b.name)).toEqual(['Damage Boost', 'Enhanced Strikes', 'Fruit Effect']);
    expect(infusionBenefits(infusionSection(feature, 'Solid Logia')!).map((b) => b.name)).toEqual(['Elemental Damage', 'Shattering Impact', 'Fruit Spells']);
    expect(infusionBenefits(infusionSection(feature, 'Zoan')!).map((b) => b.name)).toEqual(['Enhanced Strikes', 'Beastial Morph', 'Infused Animal Form']);
  });

  it('counts Devil Fruit Infusion Charges from the book’s table: Paramecia 3, 5, 7, 9, 11 and Logia 2, 3, 5, 7, 9', () => {
    const at = (level: number, category: string) => infusionCharges(feature, level, category);
    expect([2, 3, 4, 5, 8, 11, 12, 16, 20].map((l) => at(l, 'paramecia'))).toEqual([0, 3, 3, 5, 7, 7, 9, 11, 11]);
    expect([2, 3, 5, 8, 12, 16].map((l) => at(l, 'logia'))).toEqual([0, 2, 3, 5, 7, 9]);
    expect(at(10, 'zoan')).toBe(0);
    // v10 prints its own table, the other way round.
    const ten = infusionFeature(loadRules('dndf-10'))!.feature;
    expect([3, 16].map((l) => [infusionCharges(ten, l, 'paramecia'), infusionCharges(ten, l, 'logia')])).toEqual([[2, 3], [9, 11]]);
  });

  it('steps a damage die up one size, to d12 at most', () => {
    expect(['1d4', '1d6', '1d8', '1d10', '1d12', '2d6', 'd8', '1d8 + 1', 'special'].map(biggerDie)).toEqual(['1d6', '1d8', '1d10', '1d12', '1d12', '2d8', '1d10', '1d10 + 1', 'special']);
  });
});

describe.each(['dndf-8.8', 'dndf-10'] as RulesVersion[])('a Devilforged who infuses a fruit into a weapon (%s)', (version) => {
  const rules = loadRules(version);
  const base = newCharacter({ name: 'T', rulesVersion: version, classId: 'class.devilforged', level: 5, scores }, rules);
  const sword = { id: 'w1', name: 'Longsword', damage: '1d8', damageType: 'slashing', category: 'martial' as const, proficient: true };
  const doc: CharacterDoc = { ...base, weapons: [sword, { ...sword, id: 'w2', name: 'Dagger', damage: '1d4' }] };
  const sheetOf = (d: CharacterDoc, secrets: Secrets) => deriveSheet(d, rules, DEFAULT_SETTINGS, secrets);
  const infusedInto = (weaponId: string | undefined, more = {}): CharacterDoc => ({ ...doc, infusions: [{ grant: GRANT, weaponId, ...more }] });
  const body = fruit('Body Enhancer Paramecia');

  it('a Devilforged is told the feature, the level it arrives at and whether they have it', () => {
    const infuser = sheetOf(doc, granted(body)).infuser!;
    expect(infuser).toMatchObject({ level: 5, from: version === 'dndf-8.8' ? 3 : 1, ready: true });
    expect(infuser.text).toMatch(/infuse/i);
    expect(sheetOf({ ...doc, classes: [{ id: 'class.devilforged', level: 1 }] }, granted(body)).infuser!.ready).toBe(version === 'dndf-10');
    const warrior = newCharacter({ name: 'W', rulesVersion: version, classId: 'class.warrior', level: 5, scores }, rules);
    expect(sheetOf(warrior, granted(body)).infuser).toBeNull();
  });

  it('eaten, as before: the fruit is the character’s own', () => {
    const eaten = sheetOf(doc, granted(body));
    expect(eaten.fruits.map((f) => f.name)).toEqual(['Stand-in Body Enhancer Paramecia']);
    expect(eaten.infused).toEqual([]);
    expect(eaten.fruitSaveDc).not.toBeNull();
    expect(eaten.features.some((f) => f.name === 'Test Burst')).toBe(true);
  });

  it('infused: the weapon has it, and the character is no fruit user for it', () => {
    const sheet = sheetOf(infusedInto('w1'), granted(body));
    expect(sheet.fruits).toEqual([]);
    expect(sheet.fruitSaveDc).toBeNull();
    expect(sheet.features.some((f) => f.name === 'Test Burst' || f.name === 'Test Awakening')).toBe(false);
    expect(sheet.resources.some((r) => r.name === 'Devil Fruit charges')).toBe(false);
    expect(sheet.infused).toHaveLength(1);
    expect(sheet.infused[0]).toMatchObject({ grant: GRANT, weaponId: 'w1', weapon: 'Longsword', type: 'Body Enhancer Paramecia', typeRead: 'Body Enhancer Paramecia' });
    // The fruit can still be read in full.
    expect(sheet.infused[0]!.fruit.parts.map((p) => p.name)).toEqual(['Test Burst', 'Test Trait', 'Test Spells', 'Test Awakening']);
    expect(sheet.infused[0]!.rule!.text).toMatch(/Body Enhancer/);
    expect(sheet.warnings).toEqual(sheetOf(doc, granted(body)).warnings);
    // The numbers are worked out for v8.8 only; in v10 the book's own section is shown and nothing is added to the attack.
    expect(sheet.infused[0]!.numbers === null).toBe(version === 'dndf-10');
    if (version === 'dndf-10') expect(sheet.attacks.find((a) => a.id === 'w1')!.damage).toBe(sheetOf(doc, { granted: [], advancements: [] }).attacks.find((a) => a.id === 'w1')!.damage);
  });

  it('a grant with no id, or a record of a grant the character does not have, changes nothing', () => {
    const unnamed: Secrets = { granted: [{ key: `${body.id}@test`, kind: 'owner', revealed: false, entry: body }], advancements: [] };
    expect(sheetOf(infusedInto('w1'), unnamed).fruits).toHaveLength(1); // cannot be matched: still eaten
    const stale = sheetOf({ ...doc, infusions: [{ grant: 'someone-elses-grant', weaponId: 'w1' }] }, granted(body));
    expect([stale.fruits.length, stale.infused.length]).toEqual([1, 0]);
    // The public sheet, worked out without the private fruit, has no infusion and names nothing.
    const open = deriveSheet(infusedInto('w1'), rules);
    expect([open.infused.length, open.fruits.length]).toEqual([0, 0]);
    expect(JSON.stringify(open)).not.toMatch(/Stand-in|Test Burst/);
    expect(open.attacks.find((a) => a.id === 'w1')!.damage).toBe(deriveSheet(doc, rules).attacks.find((a) => a.id === 'w1')!.damage);
  });

  it('what is saved names the grant and never the fruit', () => {
    const saved = JSON.stringify(normalizeDoc(infusedInto('w1', { effect: 'Test Burst', element: 'fire' })));
    expect(saved).toContain(GRANT);
    expect(saved).not.toMatch(/Stand-in|devilFruit\./);
    expect(normalizeDoc({ ...doc, infusions: [{ grant: GRANT, weaponId: 'w1' }, { grant: GRANT }, { grant: 'bad id!' }, 'junk', null] as never })!.infusions).toEqual([{ grant: GRANT, weaponId: 'w1' }]);
  });
});

describe('the infused weapon’s numbers (v8.8)', () => {
  const rules = loadRules('dndf-8.8');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-8.8', classId: 'class.devilforged', level: 5, scores }, rules);
  const sword = { id: 'w1', name: 'Longsword', damage: '1d8', damageType: 'slashing', category: 'martial' as const, proficient: true };
  const doc: CharacterDoc = { ...base, weapons: [sword, { ...sword, id: 'w2', name: 'Dagger', damage: '1d4' }] };
  const sheetOf = (d: CharacterDoc, secrets: Secrets) => deriveSheet(d, rules, DEFAULT_SETTINGS, secrets);
  const into = (weaponId: string | undefined, more = {}): CharacterDoc => ({ ...doc, infusions: [{ grant: GRANT, weaponId, ...more }] });
  const attack = (sheet: ReturnType<typeof sheetOf>, id = 'w1') => sheet.attacks.find((a) => a.id === id)!;
  const plain = attack(sheetOf(doc, granted(fruit('Body Enhancer Paramecia'))));

  it('Body Enhancer: the die one size larger, and the rarity modifier on attack and damage', () => {
    const sheet = sheetOf(into('w1'), granted(fruit('Body Enhancer Paramecia', 'Rare')));
    const hit = attack(sheet);
    expect(hit.toHit.value).toBe(plain.toHit.value + 2);
    expect(hit.toHit.lines.at(-1)).toEqual({ label: 'Infused Devil Fruit: Enhanced Strikes', value: 2 });
    expect(hit.damage).toBe(plain.damage.replace('1d8', '1d10').replace(/\+ (\d+)/, (_m, n) => `+ ${Number(n) + 2}`));
    expect(hit.damageLines[0]).toEqual({ label: 'Weapon die 1d8, one size larger (Infused Devil Fruit: Damage Boost)', value: '1d10' });
    // The other weapon is untouched, and nothing in the breakdown names the fruit.
    expect(attack(sheet, 'w2').damage).toBe(attack(sheetOf(doc, granted(fruit('Body Enhancer Paramecia'))), 'w2').damage);
    expect(JSON.stringify(sheet.attacks)).not.toMatch(/Stand-in/);
    // No Fruit Spells in this section: no charges.
    expect(sheet.infused[0]!.resource).toBeNull();
  });

  it('a d12 weapon stays a d12; an Uncommon fruit adds 1, a Legendary one 4', () => {
    const axe: CharacterDoc = { ...into('w1'), weapons: [{ ...sword, damage: '1d12' }] };
    expect(attack(sheetOf(axe, granted(fruit('Body Enhancer Paramecia')))).damageLines[0]).toEqual({ label: 'Weapon die', value: '1d12' });
    expect(attack(sheetOf(into('w1'), granted(fruit('Body Enhancer Paramecia', 'Uncommon')))).toHit.value).toBe(plain.toHit.value + 1);
    expect(attack(sheetOf(into('w1'), granted(fruit('Standard Zoan', 'Legendary')))).toHit.value).toBe(plain.toHit.value + 4);
  });

  it('no weapon chosen yet: listed, with nothing applied to any attack', () => {
    const sheet = sheetOf(into(undefined), granted(fruit('Body Enhancer Paramecia')));
    expect(sheet.infused[0]).toMatchObject({ weaponId: null, weapon: null });
    expect(sheet.attacks.map((a) => a.damage)).toEqual(sheetOf(doc, { granted: [], advancements: [] }).attacks.map((a) => a.damage));
    // A weapon that has since been removed from the character is the same.
    expect(sheetOf(into('gone'), granted(fruit('Body Enhancer Paramecia'))).infused[0]!.weapon).toBeNull();
  });

  it('Solid Logia: extra elemental dice, the shards, and charges for the fruit’s spells that come back on a short rest', () => {
    const sheet = sheetOf(into('w1', { element: 'cold' }), granted(fruit('Solid Logia')));
    const hit = attack(sheet);
    expect(hit.damage).toBe(plain.damage);
    expect(hit.notes).toEqual(expect.arrayContaining([
      'Infused Devil Fruit: +1d6 elemental damage on a hit; ignores resistance to non-magical damage',
      'Infused Devil Fruit: on a hit, 1d6 damage to creatures within 5 ft of the target',
    ]));
    const infused = sheet.infused[0]!;
    expect(infused.rolls.map((r) => [r.label, r.dice])).toEqual([['Elemental damage (cold)', '1d6'], ['Shattering Impact: creatures within 5 ft', '1d6']]);
    const pool = sheet.resources.find((r) => r.id === infused.resource)!;
    expect(pool).toMatchObject({ name: 'Devil Fruit Infusion charges', max: 3, remaining: 3, recharge: 'short', page: 114 }); // Logia at level 5
  });

  it('Gaseous Logia reaches 10 feet further; a Zoan 5', () => {
    expect(attack(sheetOf(into('w1'), granted(fruit('Gaseous Logia')))).notes).toContain('Infused Devil Fruit: reach can grow by up to 10 ft');
    expect(attack(sheetOf(into('w1'), granted(fruit('Ancient Zoan')))).notes).toContain('Infused Devil Fruit: reach can grow by up to 5 ft');
  });

  it('Paramecia charges are the Paramecia column: 5 at level 5; none before the feature’s level', () => {
    const pool = (d: CharacterDoc) => { const s = sheetOf(d, granted(fruit('Special Paramecia'))); return s.resources.find((r) => r.id === s.infused[0]!.resource)?.max ?? 0; };
    expect(pool(into('w1'))).toBe(5);
    expect(pool({ ...into('w1'), classes: [{ id: 'class.devilforged', level: 2 }] })).toBe(0);
    expect(pool({ ...into('w1'), classes: [{ id: 'class.devilforged', level: 16 }] })).toBe(11);
  });

  it('the Fruit Effect is one feature of the fruit, chosen by the player, with its dice to roll', () => {
    const none = sheetOf(into('w1'), granted(fruit('Liquid Logia'))).infused[0]!;
    expect(none.effectOptions).toEqual(['Test Burst', 'Test Trait']); // never the awakening or the spell list
    expect(none.effect).toBeNull();
    const chosen = sheetOf(into('w1', { effect: 'Test Burst' }), granted(fruit('Liquid Logia'))).infused[0]!;
    expect(chosen.effect).toMatchObject({ name: 'Test Burst', page: 13 });
    expect(chosen.rolls.map((r) => r.dice)).toEqual(['1d6', '2d8']);
    // A section that hands over no feature offers none.
    expect(sheetOf(into('w1', { effect: 'Test Burst' }), granted(fruit('Solid Logia'))).infused[0]).toMatchObject({ effect: null, effectOptions: [] });
  });

  it('a fruit the book has no infusion for is infused with nothing applied until a type is chosen by hand', () => {
    const unread = sheetOf(into('w1'), granted(fruit('Special Logia'))).infused[0]!;
    expect(unread).toMatchObject({ type: null, typeRead: null, rule: null, numbers: null, benefits: [] });
    expect(unread.types).toHaveLength(8);
    const byHand = sheetOf(into('w1', { as: 'Gaseous Logia' }), granted(fruit('Special Logia'))).infused[0]!;
    expect(byHand).toMatchObject({ type: 'Gaseous Logia', typeRead: null });
    expect(byHand.numbers!.reach).toBe(10);
    // A type that is not one of the book's is ignored.
    expect(sheetOf(into('w1', { as: 'Made-up' }), granted(fruit('Solid Logia'))).infused[0]!.type).toBe('Solid Logia');
  });

  it('Haki Purist is kept: a fruit in a weapon is not a fruit eaten', () => {
    const picks: CharacterDoc = { ...doc, hakiPurist: ['quantity'] };
    expect(sheetOf(picks, granted(fruit('Solid Logia'))).haki.purist.earned).toBe(0); // eaten: lost
    expect(sheetOf({ ...picks, infusions: [{ grant: GRANT, weaponId: 'w1' }] }, granted(fruit('Solid Logia'))).haki.purist.earned).toBeGreaterThan(0);
  });
});

// The beast an infused Zoan weapon turns into (v8.8 p115, Infused Animal Form). Stand-in stat blocks only.

const BLOCK = [
  { name: 'Test Ox', text: 'Large beast, unaligned', page: 20 },
  { name: 'Armor Class', text: '12 (natural armor)', page: 20 },
  { name: 'Hit Points', text: '19 (3d10 + 3)', page: 20 },
  { name: 'Speed', text: '40 ft., swim 20 ft.', page: 20 },
  { name: 'STR DEX CON INT WIS CHA', text: '18 (+4) 10 (+0) 12 (+1) 2 (−4) 10 (+0) 4 (−3)', page: 20 },
  { name: 'Senses', text: 'passive Perception 10', page: 20 },
  { name: 'Challenge', text: '1/2 (100 XP)', page: 20 },
  { name: 'Trampling Charge', text: 'If the ox moves at least 20 feet straight toward a creature and then hits it, the target must succeed on a DC 14 Strength saving throw or be knocked prone.', page: 20 },
  { name: 'Actions', text: '', page: 20 },
  { name: 'Gore', text: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) piercing damage plus 3 (1d6) fire damage.', page: 20 },
  { name: 'Hooves', text: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one prone creature. Hit: 2d4 + 4 bludgeoning damage.', page: 20 },
  { name: 'Bellow', text: 'Each creature within 30 feet must succeed on a DC 12 Wisdom saving throw or be frightened.', page: 20 },
];

describe('reading a beast’s stat block', () => {
  const beast = parseBeast(BLOCK)!;

  it('takes its name, Armor Class, hit points, speed and six ability scores', () => {
    expect(beast).toMatchObject({ name: 'Test Ox', ac: 12, hp: 19, hpDice: '3d10 + 3', speed: '40 ft., swim 20 ft.' });
    expect(beast.abilities).toEqual({ str: 18, dex: 10, con: 12, int: 2, wis: 10, cha: 4 });
    expect(beast.facts.map((f) => f.name)).toEqual(['Kind', 'Senses', 'Challenge']);
  });

  it('reads each attack’s bonus and every kind of damage it deals, with or without the average in front', () => {
    expect(beast.attacks.map((a) => [a.name, a.toHit, a.damage])).toEqual([
      ['Gore', 6, [{ dice: '2d6 + 4', type: 'piercing' }, { dice: '1d6', type: 'fire' }]],
      ['Hooves', 5, [{ dice: '2d4 + 4', type: 'bludgeoning' }]],
    ]);
  });

  it('keeps what is not an attack as a trait, word for word, and drops bare headings', () => {
    expect(beast.traits.map((t) => t.name)).toEqual(['Trampling Charge', 'Bellow']);
    expect(beast.traits[0]!.text).toMatch(/^If the ox moves at least 20 feet/);
  });

  it('copes with a block that is thin, odd or not there', () => {
    expect(parseBeast([])).toBeNull();
    expect(parseBeast([{ name: '', text: '' }])).toBeNull();
    expect(parseBeast([{ name: 'Armor Class', text: 'unknown' }, { name: 'Bite', text: 'Melee Weapon Attack: +3 to hit. Hit: a nasty wound.' }])).toMatchObject({ ac: null, hp: null, abilities: null, attacks: [{ name: 'Bite', toHit: 3, damage: [] }] });
    expect(parseBeast(['junk', null, 7] as never)).toBeNull();
    expect(parseBeast([{ name: 'Hit Points', text: '45' }])).toMatchObject({ hp: 45, hpDice: null });
  });

  it('turns its physical damage into the infused weapon’s kind, and leaves elemental damage alone', () => {
    const changed = withWeaponDamage(beast.attacks, 'slashing');
    expect(changed[0]!.damage).toEqual([{ dice: '2d6 + 4', type: 'slashing' }, { dice: '1d6', type: 'fire' }]);
    expect(changed[1]!.damage).toEqual([{ dice: '2d4 + 4', type: 'slashing' }]);
    expect(withWeaponDamage(beast.attacks, undefined)).toEqual(beast.attacks);
  });

  it('puts a beast typed in by hand into shape', () => {
    expect(cleanBeast({ name: '  Stand-in Cow ', ac: 11.4, hp: 15, speed: '30 ft.', attacks: [{ name: 'Gore', toHit: 6, damage: '1d6 + 4', type: 'piercing' }, { name: '', toHit: 1 }, 'junk'], notes: ' Smells. ' }))
      .toEqual({ name: 'Stand-in Cow', ac: 11, hp: 15, speed: '30 ft.', attacks: [{ name: 'Gore', toHit: 6, damage: '1d6 + 4', type: 'piercing' }], notes: 'Smells.' });
    expect(cleanBeast({ name: 'x', ac: -5, hp: 1e9, attacks: 'no' })).toMatchObject({ ac: 0, hp: 9999, attacks: [] });
    for (const nothing of [null, 'beast', [], {}, { name: '', ac: 0, hp: 0 }]) expect(cleanBeast(nothing)).toBeNull();
  });
});

describe('a Zoan infused into a weapon has its beast as a companion (v8.8)', () => {
  const rules = loadRules('dndf-8.8');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-8.8', classId: 'class.devilforged', level: 5, scores }, rules);
  const doc: CharacterDoc = { ...base, weapons: [{ id: 'w1', name: 'Longsword', damage: '1d8', damageType: 'slashing', category: 'martial', proficient: true }] };
  const sheetOf = (d: CharacterDoc, secrets: Secrets) => deriveSheet(d, rules, DEFAULT_SETTINGS, secrets);
  const into = (more = {}, state = {}): CharacterDoc => ({ ...doc, infusions: [{ grant: GRANT, weaponId: 'w1', ...more }], state: { ...doc.state, ...state } });
  const withBlock = granted(fruit('Standard Zoan', 'Uncommon', { statBlockLines: BLOCK }));
  const without = granted(fruit('Standard Zoan', 'Uncommon'));

  it('a fruit that prints its beast: the companion is read from it', () => {
    const infused = sheetOf(into(), withBlock).infused[0]!;
    expect(infused.companion).toBe(true);
    expect(infused.beast).toMatchObject({ id: `beast.${GRANT}`, name: 'Test Ox', typed: false, ac: 12, hpMax: 19, hp: 19, speed: '40 ft., swim 20 ft.', out: false, damageType: 'slashing' });
  });

  it('its own attacks deal the weapon’s kind of damage, and it gains the weapon’s attack', () => {
    const attacks = sheetOf(into(), withBlock).infused[0]!.beast!.attacks;
    expect(attacks.map((a) => a.name)).toEqual(['Gore', 'Hooves', 'Longsword (the infused weapon’s own attack)']);
    expect(attacks[0]!.damage).toEqual([{ dice: '2d6 + 4', type: 'slashing' }, { dice: '1d6', type: 'fire' }]);
    // The weapon's die, with the beast's best attack bonus (+6) and its Strength (+4).
    expect(attacks[2]).toMatchObject({ toHit: 6, damage: [{ dice: '1d8 + 4', type: 'slashing' }] });
  });

  it('a fruit that names its beast from another book: no numbers until the player types them', () => {
    const none = sheetOf(into(), without).infused[0]!;
    expect([none.companion, none.beast]).toEqual([true, null]);
    const typed = sheetOf(into({ beast: { name: 'Stand-in Cow', ac: 11, hp: 15, speed: '30 ft.', attacks: [{ name: 'Gore', toHit: 6, damage: '1d6 + 4', type: 'piercing' }], notes: 'Smells.' } }), without).infused[0]!.beast!;
    expect(typed).toMatchObject({ name: 'Stand-in Cow', typed: true, ac: 11, hpMax: 15, hp: 15, speed: '30 ft.', abilities: null });
    expect(typed.attacks.map((a) => [a.name, a.toHit, a.damage[0]])).toEqual([
      ['Gore', 6, { dice: '1d6 + 4', type: 'slashing' }],
      ['Longsword (the infused weapon’s own attack)', 6, { dice: '1d8', type: 'slashing' }],
    ]);
    expect(typed.traits).toEqual([{ name: 'Notes', text: 'Smells.' }]);
  });

  it('the player’s own numbers win over the fruit’s stat block', () => {
    const typed = sheetOf(into({ beast: { name: 'My Ox', ac: 14, hp: 30, speed: '50 ft.', attacks: [] } }), withBlock).infused[0]!.beast!;
    expect(typed).toMatchObject({ name: 'My Ox', typed: true, ac: 14, hpMax: 30 });
  });

  it('its hit points go down with damage and it can be out or put away, without touching the character’s own', () => {
    const hurt = sheetOf(into({}, { counters: { [`beast.${GRANT}`]: 7 }, toggles: { [`beast.${GRANT}`]: true } }), withBlock);
    expect(hurt.infused[0]!.beast).toMatchObject({ hp: 12, hpMax: 19, out: true });
    expect(sheetOf(into({}, { counters: { [`beast.${GRANT}`]: 500 } }), withBlock).infused[0]!.beast!.hp).toBe(0);
    expect(hurt.maxHp.value).toBe(sheetOf(into(), withBlock).maxHp.value);
    // Its maximum can be typed over like any number.
    expect(sheetOf({ ...into(), overrides: { [`beast.hp.${GRANT}`]: 40 } }, withBlock).infused[0]!.beast!.hpMax).toBe(40);
  });

  it('only a Zoan’s infusion has a companion, and no weapon chosen means no weapon attack', () => {
    const solid = sheetOf(into(), granted(fruit('Solid Logia', 'Rare', { statBlockLines: BLOCK }))).infused[0]!;
    expect([solid.companion, solid.beast]).toEqual([false, null]);
    const unarmed = sheetOf({ ...doc, infusions: [{ grant: GRANT }] }, withBlock).infused[0]!.beast!;
    expect(unarmed.attacks.map((a) => a.name)).toEqual(['Gore', 'Hooves']);
    expect(unarmed.attacks[0]!.damage[0]).toEqual({ dice: '2d6 + 4', type: 'piercing' }); // no weapon, so its own kind
  });

  it('nothing of the beast is on the sheet worked out without the private fruit', () => {
    const open = deriveSheet(into({ beast: undefined }), rules);
    expect(open.infused).toEqual([]);
    expect(JSON.stringify(open)).not.toMatch(/Test Ox|Gore/);
  });
});
