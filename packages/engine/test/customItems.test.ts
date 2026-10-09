// Items a player makes themselves, and what each does on the sheet while it is in use.
import { describe, expect, it } from 'vitest';
import { activateFeature, cleanCustomItem, deriveSheet, exportFile, itemDoesSomething, itemSummary, longRest, newCharacter, normalizeDoc, readExport, withEquippedItems, type CharacterDoc, type InventoryItem } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
// Warrior 5, Str 16 (+3), Dex 14 (+2), proficiency +3.
const base = newCharacter({ name: 'Zoro', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: [] }, rules);
const carrying = (...inventory: InventoryItem[]): CharacterDoc => ({ ...base, inventory });
const plain = deriveSheet(base, rules);

const katana: InventoryItem = { id: 'k', name: 'Wado Ichimonji', qty: 1, weight: 3, equipped: true, custom: { kind: 'weapon', rarity: 'Rare', value: 10_000_000, text: 'A blade that cannot be broken.', weapon: { damage: '1d8', damageType: 'slashing', category: 'martial', finesse: true, bonus: 1 } } };
const coat: InventoryItem = { id: 'c', name: 'Sea-king hide coat', qty: 1, weight: 13, equipped: true, custom: { kind: 'armor', armor: { base: 13, dexCap: 2 } } };
const buckler: InventoryItem = { id: 'b', name: 'Shell buckler', qty: 1, equipped: true, custom: { kind: 'shield', bonuses: [{ type: 'ac', value: 1 }] } };
const ring: InventoryItem = { id: 'r', name: 'Ring of the Tides', qty: 1, equipped: true, custom: { kind: 'wondrous', rarity: 'Very Rare', text: 'Hums near water.', bonuses: [{ type: 'speed', value: 10 }, { type: 'initiative', value: 2 }, { type: 'hp', value: 5 }], uses: { max: 3, recharge: 'long' }, rolls: [{ label: 'Tidal lash', dice: '2d6', kind: 'damage' }], action: 'bonus', note: 'Resistance to cold damage' } };

describe('items a player makes', () => {
  it('a weapon in use is an attack: Str +3, proficiency +3, its own +1 → +7 to hit, 1d8 + 4', () => {
    const sheet = deriveSheet(carrying(katana), rules);
    const attack = sheet.attacks.find((a) => a.name === 'Wado Ichimonji')!;
    expect(attack.toHit.value).toBe(7);
    expect(attack.damage).toBe('1d8 + 4');
    expect(attack.damageType).toBe('slashing');
    expect(plain.attacks.some((a) => a.name === 'Wado Ichimonji')).toBe(false);
    // Put away, stowed on the ship, or with none left, it is gone from the sheet again.
    for (const change of [{ equipped: false }, { carried: false }, { qty: 0 }]) expect(deriveSheet(carrying({ ...katana, ...change }), rules).attacks.map((a) => a.name)).toEqual(plain.attacks.map((a) => a.name));
    // Its description is a feature on the sheet while it is in use.
    expect(sheet.features.find((f) => f.name === 'Wado Ichimonji')).toMatchObject({ text: 'A blade that cannot be broken.', from: 'Item (Rare)' });
  });

  it('armor in use sets Armor Class: 13 + Dex 2 (max 2) = 15; a shield adds 2, and its own +1 on top', () => {
    expect(plain.ac.value).toBe(12); // unarmored: 10 + Dex 2
    const armored = deriveSheet(carrying(coat), rules);
    expect(armored.ac.value).toBe(15);
    expect(armored.ac.lines.map((l) => [l.label, l.value])).toEqual([['Sea-king hide coat', 13], ['Dexterity modifier (max 2)', 2]]);
    const both = deriveSheet(carrying(coat, buckler), rules);
    expect(both.ac.value).toBe(18);
    expect(both.ac.lines.map((l) => l.label)).toEqual(expect.arrayContaining(['Shield', 'Shell buckler']));
    // Heavy armor: Dexterity counts for nothing. Light: all of it.
    expect(deriveSheet(carrying({ ...coat, custom: { kind: 'armor', armor: { base: 18, dexCap: 0 } } }), rules).ac.value).toBe(18);
    expect(deriveSheet(carrying({ ...coat, custom: { kind: 'armor', armor: { base: 11, dexCap: null } } }), rules).ac.value).toBe(13);
    // Wearing two made armors uses the first; nothing breaks.
    expect(deriveSheet(carrying(coat, { ...coat, id: 'c2', name: 'Plate', custom: { kind: 'armor', armor: { base: 18, dexCap: 0 } } }), rules).ac.value).toBe(15);
  });

  it('an item with powers adds its numbers, has charges that come back on a rest, dice to roll and a standing note', () => {
    const doc = carrying(ring);
    const sheet = deriveSheet(doc, rules);
    expect(sheet.speed.value).toBe(plain.speed.value + 10);
    expect(sheet.initiative.value).toBe(plain.initiative.value + 2);
    expect(sheet.maxHp.value).toBe(plain.maxHp.value + 5);
    expect(sheet.speed.lines.at(-1)).toMatchObject({ label: 'Ring of the Tides', value: 10 });
    expect(sheet.notes.some((n) => n.label === 'Resistance to cold damage')).toBe(true);
    const feature = sheet.features.find((f) => f.name === 'Ring of the Tides')!;
    expect(feature).toMatchObject({ action: 'bonus', from: 'Item (Very Rare)' });
    expect(feature.rolls.map((r) => [r.label, r.dice])).toEqual([['Tidal lash', '2d6']]);
    const pool = sheet.resources.find((r) => r.name === 'Ring of the Tides')!;
    expect(pool).toMatchObject({ max: 3, remaining: 3, recharge: 'long' });
    // Using it spends a charge; a long rest brings them back.
    const used = activateFeature(doc.state, sheet, feature);
    const after = deriveSheet({ ...doc, state: used.state }, rules);
    expect(after.resources.find((r) => r.name === 'Ring of the Tides')!.remaining).toBe(2);
    const rested = longRest({ ...doc, state: used.state }, after);
    expect(deriveSheet({ ...doc, state: rested.state }, rules).resources.find((r) => r.name === 'Ring of the Tides')!.remaining).toBe(3);
    // Not in use: none of it.
    const off = deriveSheet(carrying({ ...ring, equipped: false }), rules);
    expect([off.speed.value, off.initiative.value, off.maxHp.value, off.resources.length, off.features.length]).toEqual([plain.speed.value, plain.initiative.value, plain.maxHp.value, plain.resources.length, plain.features.length]);
  });

  it('several items in use at once all count, and the saved character is not changed by any of it', () => {
    const doc = carrying(katana, coat, buckler, ring);
    const before = JSON.stringify(doc);
    const sheet = deriveSheet(doc, rules);
    expect(sheet.ac.value).toBe(18);
    expect(sheet.attacks.map((a) => a.name)).toContain('Wado Ichimonji');
    expect(JSON.stringify(doc)).toBe(before);
    const effective = withEquippedItems(doc);
    expect(effective.weapons.map((w) => w.id)).toEqual([...base.weapons.map((w) => w.id), 'item:k']);
    expect(effective.customFeatures!.map((f) => f.id)).toEqual(['item-k', 'item-b', 'item-r']);
    expect(withEquippedItems(base)).toBe(base); // nothing in use: the very same character
    // Weight still counts: 3 + 13 lb of the two with a weight.
    expect(sheet.gear.carried).toBe(16);
  });

  it('one line says what an item is and does', () => {
    expect(itemSummary(katana.custom!)).toBe('Weapon · 1d8 slashing, +1 to hit and damage (martial, finesse) · Rare · ฿10,000,000');
    expect(itemSummary(coat.custom!)).toBe('Armor · AC 13 + Dex (max 2)');
    expect(itemSummary(buckler.custom!)).toBe('Shield · +2 AC · +1 AC');
    expect(itemSummary(ring.custom!)).toBe('Wondrous item · +10 ft speed · +2 initiative · +5 hit points · 3 charges (long rest) · Tidal lash 2d6 · Resistance to cold damage · Very Rare');
    expect(itemSummary({ kind: 'gear' })).toBe('Gear');
    expect([katana, coat, buckler, ring].every((i) => itemDoesSomething(i.custom))).toBe(true);
    expect(itemDoesSomething({ kind: 'gear', text: 'A crate of oranges.' })).toBe(false);
    expect(itemDoesSomething(undefined)).toBe(false);
  });

  it('a made item is checked like everything else that is saved: bad parts are dropped, the rest kept', () => {
    expect(cleanCustomItem(null)).toBeUndefined();
    expect(cleanCustomItem({ kind: 'spaceship' })).toBeUndefined();
    expect(cleanCustomItem({ kind: 'weapon', weapon: { damage: 'lots', damageType: 7 } })).toEqual({ kind: 'weapon' });
    expect(cleanCustomItem({ kind: 'weapon', weapon: { damage: ' 2d6 ', category: 'x', bonus: 99, ranged: 'yes' }, armor: { base: 18 } })).toEqual({ kind: 'weapon', weapon: { damage: '2d6', damageType: '', category: 'simple', bonus: 10 } });
    expect(cleanCustomItem({ kind: 'armor', armor: { base: 999, dexCap: -3 }, weapon: { damage: '1d6' } })).toEqual({ kind: 'armor', armor: { base: 40, dexCap: 0 } });
    expect(cleanCustomItem({ kind: 'wondrous', value: -5, rarity: '  ', uses: { max: 0 }, rolls: [{ dice: 'banana' }, null, { dice: '1d4+1', kind: 'heal' }], bonuses: [{ type: 'ac', value: 1 }, { type: 'ac', value: 5 }, { type: 'luck', value: 2 }, { type: 'hp', value: 'x' }], note: 5, action: 'free' }))
      .toEqual({ kind: 'wondrous', value: 0, rolls: [{ label: '1d4+1', dice: '1d4+1', kind: 'heal' }], bonuses: [{ type: 'ac', value: 1 }] });
    const saved = normalizeDoc(JSON.parse(JSON.stringify({ ...base, inventory: [katana, { id: 'x', name: 'Odd', qty: 1, equipped: 'yes', custom: 'broken' }, { id: 'y', name: 'Plain', qty: 2 }] })))!;
    expect(saved.inventory![0]).toMatchObject({ name: 'Wado Ichimonji', equipped: true, custom: katana.custom });
    expect(saved.inventory![1]).toMatchObject({ name: 'Odd', equipped: undefined, custom: undefined });
    expect(() => deriveSheet(saved, rules)).not.toThrow();
    expect(normalizeDoc(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('made items travel in an export file and work the same after import', () => {
    const doc = carrying(katana, coat, ring);
    const [back] = readExport(JSON.stringify(exportFile({ characters: [doc] }, '2026-10-09T00:00:00Z'))).characters;
    const a = deriveSheet(doc, rules);
    const b = deriveSheet(back!, rules);
    expect([b.ac.value, b.speed.value, b.maxHp.value, b.attacks.map((x) => `${x.name} ${x.toHit.value} ${x.damage}`)]).toEqual([a.ac.value, a.speed.value, a.maxHp.value, a.attacks.map((x) => `${x.name} ${x.toHit.value} ${x.damage}`)]);
  });
});
