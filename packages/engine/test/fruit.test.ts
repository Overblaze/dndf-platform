// A granted Devil Fruit on the sheet. Every fruit and advancement here is made up: no private content is in the repository.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, dawn, deriveSheet, diceInText, fruitCategory, newCharacter, spendResource, surgeOptions, withSecrets, type AbilityScores, type RuleEntry, type RulesVersion, type Secrets, type Sheet } from '../src';
import { loadRules } from './load';

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const fruit = (name: string, type: string, more: Partial<RuleEntry> = {}): RuleEntry => ({
  id: `devilFruit.${name.toLowerCase().replace(/\W+/g, '_')}`, kind: 'devilFruit', name, versions: [], source: { book: 'Test Fruit Book', page: 12 },
  rarity: 'Rare', type, appearance: 'A striped pear.', description: 'Lets the eater do test things.', seaWeakness: 'Cannot swim.',
  features: [{ name: 'Test Burst', text: 'As an action you deal 2d8 fire damage, or 1d6 + 2 temporary hit points to yourself.', page: 13 }, { name: 'Test Trait', text: 'You are immune to tests.', page: 13 }] as never,
  spells: { name: 'Test Spells', text: 'You can cast test spells with charges.', page: 14 },
  awakening: { name: 'Test Awakening', text: 'Once per day you deal 10d10 force damage.', page: 14 },
  ...more,
});
const advancement = (id: string, more: Partial<RuleEntry> = {}): RuleEntry => ({ id: `fruitAdvancement.${id}`, kind: 'fruitAdvancement', name: `Test ${id}`, versions: ['dndf-10', 'dndf-8.8'], source: { book: 'Test Handbook', page: 236 }, typeLine: 'Devil Fruit Advancement, Rare', text: 'You deal 3d6 extra damage once per long rest.', ...more });
const holding = (entry: RuleEntry, more: Partial<Secrets> = {}): Secrets => ({ granted: [{ key: `${entry.id}@test`, kind: 'owner', revealed: false, entry }], advancements: [], ...more });

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('a granted Devil Fruit (%s)', (version) => {
  const rules = loadRules(version);
  const doc = newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level: 7, scores }, rules);
  const sheetWith = (secrets: Secrets, d = doc) => deriveSheet(d, rules, DEFAULT_SETTINGS, secrets);
  const plain = deriveSheet(doc, rules);
  const pool = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);

  it('without private content the sheet has no fruit, no fruit numbers and no warnings', () => {
    expect(plain).toMatchObject({ fruits: [], knownFruits: [], fruitSaveDc: null, fruitAttack: null, warnings: [] });
  });

  it('a Paramecia: its text word for word, its features with roll buttons, charges by level, DC and attack', () => {
    const sheet = sheetWith(holding(fruit('Test Pear', 'Paramecia — Body Enhancer')));
    expect(sheet.fruits[0]).toMatchObject({ name: 'Test Pear', book: 'Test Fruit Book', page: 12, rarity: 'Rare', category: 'paramecia', appearance: 'A striped pear.', seaWeakness: 'Cannot swim.', revealed: false, highestSpellLevel: 4 });
    expect(sheet.fruits[0]!.parts.map((p) => p.name)).toEqual(['Test Burst', 'Test Trait', 'Test Spells', 'Test Awakening']);
    const burst = sheet.features.find((f) => f.name === 'Test Burst')!;
    expect(burst).toMatchObject({ text: 'As an action you deal 2d8 fire damage, or 1d6 + 2 temporary hit points to yourself.', page: 13, book: 'Test Fruit Book', from: 'Devil Fruit: Test Pear' });
    expect(burst.rolls).toEqual([{ label: '2d8 fire damage', dice: '2d8', kind: 'damage' }, { label: '1d6 + 2 temporary hit points', dice: '1d6 + 2', kind: 'tempHp' }]);
    expect(sheet.features.find((f) => f.name === 'Test Awakening')!.from).toBe('Devil Fruit: Test Pear (awakening)');
    expect(pool(sheet, 'Devil Fruit charges')).toMatchObject({ max: 7, remaining: 7, recharge: 'dawn' }); // Paramecia: charges = level
    // The counter is named by position, so the saved character never says which fruit it is.
    expect(sheet.fruits[0]!.resources).toEqual(['fruit.charges']);
    const two = sheetWith({ granted: [...holding(fruit('Test Pear', 'Paramecia')).granted, ...holding(fruit('Test Cat', 'Standard Zoan')).granted], advancements: [] });
    expect(two.fruits.map((f) => f.resources)).toEqual([['fruit.charges'], ['fruit2.beast_form']]);
    expect([sheet.fruitSaveDc!.value, sheet.fruitAttack!.value]).toEqual([14, 6]); // Willpower 7: 10 + 4, 2 + 4
    expect(sheet.warnings).toEqual([]);
  });

  it('charges are spent and come back at dawn; a Logia reads its own table; a Zoan gets Beast Form uses', () => {
    const secrets = holding(fruit('Test Pear', 'Paramecia'));
    const sheet = sheetWith(secrets);
    const id = pool(sheet, 'Devil Fruit charges')!.id;
    const spent = { ...doc, state: spendResource(doc.state, sheet, id, 3).state };
    expect(pool(sheetWith(secrets, spent), 'Devil Fruit charges')!.remaining).toBe(4);
    const morning = { ...spent, state: dawn(spent, sheetWith(secrets, spent)).state };
    expect(pool(sheetWith(secrets, morning), 'Devil Fruit charges')!.remaining).toBe(7);
    expect(pool(sheetWith(holding(fruit('Test Smoke', 'Gaseous Logia'))), 'Devil Fruit charges')!.max).toBe(5); // Logia at 7th: 5
    const zoan = sheetWith(holding(fruit('Test Cat', 'Standard Zoan', { statBlockLines: [{ name: 'Test Cat', text: 'Small beast, unaligned', page: 12 }, { name: 'Armor Class', text: '12', page: 12 }, { name: 'Actions', text: '', page: 12 }, { name: 'Bite', text: 'Melee Weapon Attack: +4 to hit.', page: 12 }] as never })));
    expect(zoan.fruits[0]!.statBlock).toEqual(['Test Cat. Small beast, unaligned', 'Armor Class 12', 'Actions', 'Bite. Melee Weapon Attack: +4 to hit.']);
    expect(pool(zoan, 'Beast Form')).toMatchObject({ max: 3, recharge: 'dawn' }); // proficiency bonus
    expect(pool(zoan, 'Devil Fruit charges')).toBeUndefined();
    expect(sheetWith(secrets, { ...doc, overrides: { [`resource.${id}`]: 9 } }).resources.find((r) => r.id === id)!.max).toBe(9);
  });

  it('the type is read from the type line or the section; an unreadable one still shows the fruit, without charges', () => {
    expect(fruitCategory(fruit('A', 'garbled', { section: 'Zoan Devil Fruits' }))).toBe('zoan');
    expect(fruitCategory(fruit('A', 'garbled'))).toBe('other');
    const sheet = sheetWith(holding(fruit('Odd', 'garbled')));
    expect(sheet.fruits[0]!.category).toBe('other');
    expect(pool(sheet, 'Devil Fruit charges')).toBeUndefined();
    expect(sheet.features.some((f) => f.name === 'Test Burst')).toBe(true);
  });

  it('a fruit only known about can be read but puts nothing on the sheet', () => {
    const entry = fruit('Rumoured', 'Paramecia');
    const sheet = sheetWith({ granted: [{ key: 'k', kind: 'knowledge', revealed: false, entry }], advancements: [] });
    expect(sheet.knownFruits.map((f) => [f.name, f.features, f.parts.length])).toEqual([['Rumoured', [], 4]]);
    expect(sheet).toMatchObject({ fruits: [], fruitSaveDc: null });
    expect(sheet.features.length).toBe(plain.features.length);
    expect(sheet.resources.length).toBe(plain.resources.length);
  });

  it('holding a fruit loses every Haki Purist improvement', () => {
    const trained = { ...doc, surges: [{ id: 'a', entry: 'hakiFeature.force_of_will' }], hakiPurist: ['quality', 'stamina'] as ('quality' | 'stamina')[] };
    const before = deriveSheet(trained, rules);
    const after = sheetWith(holding(fruit('Test Pear', 'Paramecia')), trained);
    expect([pool(before, 'Force of Will')!.max, before.features.find((f) => f.name === 'Force of Will')!.rolls[0]!.dice, before.haki.purist.earned]).toEqual([2, '4d10', 1]);
    expect([pool(after, 'Force of Will')!.max, after.features.find((f) => f.name === 'Force of Will')!.rolls[0]!.dice, after.haki.purist.earned]).toEqual([1, '3d10', 0]);
    expect(after.haki.purist.picks).toEqual(['quality', 'stamina']); // kept in the save, in case the fruit is taken away
  });

  it('Devil Fruit advancements: offered to a holder, held back by fruit type, and on the sheet with uses and dice', () => {
    const advancements = [advancement('any'), advancement('zoan_only', { prerequisite: 'Zoan Type' }), advancement('either', { prerequisite: 'Zoan or Logia Type' }), advancement('charged', { uses: { max: 'prof', recharge: 'long' } }), advancement('other_book', { versions: [version === 'dndf-10' ? 'dndf-8.8' : 'dndf-10'] })];
    const secrets = holding(fruit('Test Smoke', 'Gaseous Logia'), { advancements });
    const merged = withSecrets(rules, secrets, version);
    const context = { tiers: { armament: 0, observation: 0, supremeKing: 0 }, spellcaster: false };
    const offered = (categories: string[], rarity: 'Uncommon' | 'Legendary' = 'Legendary') => Object.fromEntries(surgeOptions(doc, merged, rarity, { ...context, fruitCategories: categories }).filter((o) => o.tab === 'fruit').map((o) => [o.entry.name, o.blocked]));
    expect(offered(['logia'])).toEqual({ 'Test any': [], 'Test zoan_only': ['Needs a Zoan fruit'], 'Test either': [], 'Test charged': [] });
    expect(offered([])['Test any']).toEqual(['Needs a Devil Fruit']);
    expect(offered(['logia'], 'Uncommon')['Test any']).toEqual(['Needs a Rare Spirit Surge']);
    expect(surgeOptions(doc, rules, 'Legendary', context).some((o) => o.tab === 'fruit')).toBe(false);

    const took = { ...doc, surges: [{ id: 's1', entry: 'fruitAdvancement.charged' }] };
    const sheet = sheetWith(secrets, took);
    const shown = sheet.features.find((f) => f.name === 'Test charged')!;
    expect(shown).toMatchObject({ from: 'Devil Fruit advancement', book: 'Test Handbook', page: 236, resource: 'use.surge/s1' });
    expect(shown.rolls[0]).toMatchObject({ dice: '3d6' });
    expect(sheet.resources.find((r) => r.id === 'use.surge/s1')).toMatchObject({ max: 3, recharge: 'long' });
    // Without the private content (a printed sheet, the bot) the advancement is left out and never named.
    const publicSheet = deriveSheet(took, rules);
    expect(publicSheet.warnings).toEqual([]);
    expect(JSON.stringify(publicSheet)).not.toMatch(/Test charged|fruitAdvancement\.charged"?,"name/);
    expect(publicSheet.features.some((f) => f.key.startsWith('surge/'))).toBe(false);
  });
});

describe('dice in a private feature’s text', () => {
  it('reads each roll once, with what it is for, and leaves d20s and unreadable dice alone', () => {
    expect(diceInText('Deal 2d6 + 3 slashing damage, then 2d6 + 3 again, heal 1d8 hit points, roll 1d20, and 4d10.')).toEqual([
      { label: '2d6 + 3 slashing damage', dice: '2d6 + 3', kind: 'damage' }, { label: '1d8 hit points', dice: '1d8', kind: 'heal' }, { label: '4d10', dice: '4d10', kind: 'other' },
    ]);
    expect(diceInText('No dice here, only a d6 mentioned loosely.')).toEqual([]);
  });
});
