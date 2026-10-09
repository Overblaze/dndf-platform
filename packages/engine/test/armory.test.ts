// Handbook chapters 4, 5 and 7: spell lists, Spirit Surges and Haki, the armory.
import { describe, expect, it } from 'vitest';
import { armorFromItem, deriveSheet, hakiTier, newCharacter, weaponFromItem, type RuleEntry, type SectionDef } from '../src';
import { loadRules } from './load';

describe.each(['dndf-10', 'dndf-8.8'] as const)('chapters 4, 5 and 7 for %s', (version) => {
  const rules = loadRules(version);
  const all = [...rules.values()];
  const ofKind = (kind: string) => all.filter((e) => e.kind === kind);
  const item = (id: string) => rules.get(`item.${id}`)!;

  it('has the Standard advancements and the three Colors of Haki, each with its Amateur features', () => {
    expect(ofKind('surgeAdvancement')).toHaveLength(11);
    for (const [color, count] of [['armament', 20], ['observation', 20], ['supremeKing', 24]] as const) {
      const features = ofKind('hakiFeature').filter((f) => f.color === color);
      expect(features.filter((f) => !f.amateur), color).toHaveLength(count);
      expect(features.filter((f) => f.amateur).map((f) => f.rarity), color).toEqual(['Common', 'Common', 'Common']);
    }
    for (const entry of [...ofKind('surgeAdvancement'), ...ofKind('hakiFeature')]) {
      expect(['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'], entry.name).toContain(entry.rarity);
      expect(String(entry.text).length, entry.name).toBeGreaterThan(30);
      expect(String(entry.prerequisite ?? '').length, `${entry.name} prerequisite`).toBeLessThan(60);
      expect(String(entry.prerequisite ?? ''), `${entry.name} prerequisite`).not.toContain('.');
    }
  });

  it('never includes Devil Fruit advancements, fruits, or the generation tables', () => {
    expect(all.filter((e) => /devil fruit advancement/i.test(String(e.typeLine ?? '')))).toEqual([]);
    expect(ofKind('devilFruit')).toEqual([]);
    expect(all.filter((e) => /devil fruit generation/i.test(e.name))).toEqual([]);
    // The player-facing fruit rules are public: how the three types work, not what any fruit does.
    expect(['Devil Fruit Creation', 'Paramecia Rules', 'Zoan Rules', 'Logia Rules'].every((name) => all.some((e) => e.kind === 'rule' && e.name === name))).toBe(true);
  });

  it('counts Haki tiers from real features: tier 2 at four of a Color, Amateur ones not counting', () => {
    const armament = ofKind('hakiFeature').filter((f) => f.color === 'armament') as (RuleEntry & { rarity: string })[];
    const real = armament.filter((f) => !f.amateur);
    const amateur = armament.filter((f) => f.amateur);
    expect(hakiTier(real.slice(0, 4))).toBe(2);
    expect(hakiTier([...real.slice(0, 3), ...amateur])).toBe(1);
    expect(hakiTier(real.slice(0, 6))).toBe(3);
  });

  it('has a spell list for each casting class and the eleven custom spells', () => {
    const lists = ofKind('spellList').map((l) => l.name);
    expect(lists).toEqual(expect.arrayContaining(['Chemist Spells', 'Hybrid Spells', 'Marksman Spells', 'Oracle Spells', 'Priest Spells', 'Tinkerer Spells']));
    expect(lists).toContain(version === 'dndf-10' ? 'Virtuoso Spells' : 'Skald Spells');
    expect(lists.includes('Devilforged Spells')).toBe(version === 'dndf-8.8');
    const chemist = rules.get('spellList.chemist')!.levels as Record<string, string[]>;
    expect(chemist['0']).toContain('Guidance');
    expect(Object.keys(chemist)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    // The handbook's own spells; the 319 from the free 5e rules sit beside them (spells.test.ts).
    const spells = ofKind('spell').filter((s) => s.source.book !== '5e SRD 5.1');
    expect(spells).toHaveLength(11);
    expect(rules.get('spell.slime_wave')).toMatchObject({ level: 3, school: 'conjuration', castingTime: '1 action', range: '120 feet' });
    for (const spell of spells) expect(String(spell.text).length, spell.name).toBeGreaterThan(80);
  });

  it('has the armor table: 12 armors and the shield', () => {
    expect(ofKind('item').filter((i) => i.itemType === 'armor')).toHaveLength(12);
    expect(item('chain_mail')).toMatchObject({ category: 'heavy', ac: { base: 16, dex: 'none' }, strength: 13, stealthDisadvantage: true, cost: 750_000 });
    expect(item('hide')).toMatchObject({ category: 'medium', ac: { base: 12, dex: 'max2' } });
    expect(item('thick_shirt')).toMatchObject({ category: 'light', ac: { base: 11, dex: 'full' }, stealthDisadvantage: false });
    expect(item('shield')).toMatchObject({ itemType: 'shield', ac: { bonus: 2 } });
    expect(armorFromItem(item('chain_mail'))).toEqual({ name: 'Chain Mail', base: 16, dexCap: 0, stealthDisadvantage: true });
    expect(armorFromItem(item('hide'))).toEqual({ name: 'Hide', base: 12, dexCap: 2 });
    expect(armorFromItem(item('thick_shirt'))).toEqual({ name: 'Thick Shirt', base: 11, dexCap: null });
  });

  it('has the weapon tables with damage, type and properties', () => {
    const weapons = ofKind('item').filter((i) => i.itemType === 'weapon');
    expect(weapons.length).toBeGreaterThanOrEqual(58);
    expect(item('cutlass')).toMatchObject({ category: 'martial', ranged: false, damage: '1d6', damageType: 'slashing', cost: 300_000 });
    expect(item('dagger')).toMatchObject({ category: 'simple', finesse: true, light: true, thrown: true });
    expect(item('greatclub')).toMatchObject({ twoHanded: true });
    expect(item('quarterstaff')).toMatchObject({ versatile: '1d8' });
    expect(item('musket')).toMatchObject({ category: 'simple', ranged: true, damage: '1d10' });
    expect(weaponFromItem(item('dagger'))).toEqual({ id: 'item.dagger', name: 'Dagger', damage: '1d4', damageType: 'piercing', category: 'simple', finesse: true });
    expect(weaponFromItem(item('net'))).toBeNull();
    expect(weaponFromItem(item('brass_knuckles'))).toBeNull();
    // Every weapon that deals dice of damage can go on a sheet.
    for (const weapon of weapons.filter((w) => /\dd\d/.test(String(w.damage ?? '')))) expect(weaponFromItem(weapon), weapon.name).not.toBeNull();
  });

  it('puts armory gear on a sheet with the right numbers', () => {
    const scores = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
    const doc = newCharacter({ name: 'Armed', rulesVersion: version, classId: 'class.warrior', level: 5, scores }, rules);
    const sheet = deriveSheet({ ...doc, armor: armorFromItem(item('chain_mail')), shield: true, weapons: [weaponFromItem(item('longsword'))!, weaponFromItem(item('musket'))!] }, rules);
    expect(sheet.ac.value).toBe(18);
    expect(sheet.attacks.map((a) => [a.name, a.toHit.value, a.damage])).toEqual([
      ['Unarmed strike', 7, '5'],
      ['Longsword', 7, '1d8 + 4'],
      ['Musket', 5, '1d10 + 2'],
    ]);
  });

  it('keeps the general rules the sheet quotes', () => {
    expect((rules.get('rule.haki_tiers')!.text as string)).toContain('Tier 2 Haki with 4 features');
    expect(rules.get('rule.haki_spellcasting_ability')!.text).toContain('Haki save DC = 10 + half of your Willpower (rounded up)');
    const purist = rules.get('rule.haki_purist')!;
    expect(String(purist.text)).toContain(version === 'dndf-10' ? 'again at 10th, and 16th' : 'again at 8th, 12th, 16th and 20th level');
    expect((rules.get('rule.devil_fruit_creation')!.sections as SectionDef[]).length).toBeGreaterThan(3);
  });
});

describe('Strengthen Self differs between the handbooks', () => {
  it('raises Willpower in v10 only', () => {
    expect(String(loadRules('dndf-10').get('surgeAdvancement.strengthen_self')!.text)).toContain('+2 to your willpower score');
    expect(String(loadRules('dndf-8.8').get('surgeAdvancement.strengthen_self')!.text)).not.toMatch(/willpower/i);
  });
});
