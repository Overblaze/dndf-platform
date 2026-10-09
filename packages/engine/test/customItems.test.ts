// Items a player makes themselves, and what each does on the sheet while it is in use.
import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, activateFeature, bookMagicItems, cleanCustomItem, deriveSheet, exportFile, itemDoesSomething, itemNeedsAttunement, itemSummary, longRest, newCharacter, normalizeDoc, readExport, withEquippedItems, type CharacterDoc, type InventoryItem } from '../src';
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

describe('items that change scores, saves and skills, grant spells, and need attunement', () => {
  // Warrior 5: Int 10 (+0), Wis 12 (+1), proficiency +3.
  const circlet: InventoryItem = { id: 'ci', name: 'Circlet of Intellect', qty: 1, custom: { kind: 'wondrous', rarity: 'Uncommon', attune: true, text: 'Your Intelligence score is 19 while you wear this circlet.', abilities: [{ ability: 'int', set: 19 }] } };
  const skill = (sheet: ReturnType<typeof deriveSheet>, id: string) => sheet.skills.find((s) => s.id === id)!;

  it('the Circlet of Intellect: nothing until it is both worn and attuned, then Intelligence 19 and everything that follows from it', () => {
    expect(plain.abilities.int).toEqual({ score: 10, mod: 0 });
    for (const state of [{}, { equipped: true }, { attuned: true }]) {
      const sheet = deriveSheet(carrying({ ...circlet, ...state }), rules);
      expect(sheet.abilities.int, JSON.stringify(state)).toEqual({ score: 10, mod: 0 });
    }
    const on = deriveSheet(carrying({ ...circlet, equipped: true, attuned: true }), rules);
    expect(on.abilities.int).toEqual({ score: 19, mod: 4, changes: [{ label: 'Circlet of Intellect: set to 19', to: 19 }] });
    expect(on.saves.int.value).toBe(plain.saves.int.value + 4);
    expect(on.saves.int.lines[0]).toEqual({ label: 'Intelligence modifier', value: 4 });
    for (const id of ['arcana', 'history', 'investigation', 'nature', 'religion']) expect(skill(on, id).value, id).toBe(skill(plain, id).value + 4);
    expect(skill(on, 'athletics').value).toBe(skill(plain, 'athletics').value);
    // The saved character still says 10: take the circlet off and it is 10 again.
    expect(carrying({ ...circlet, equipped: true, attuned: true }).scores.int).toBe(10);
    // It does nothing for someone already at 19 or more.
    const clever = { ...carrying({ ...circlet, equipped: true, attuned: true }), scores: { ...base.scores, int: 20 } };
    expect(deriveSheet(clever, rules).abilities.int).toEqual({ score: 20, mod: 5 });
    expect(itemSummary(circlet.custom!)).toBe('Wondrous item · Int 19 · requires attunement · Uncommon');
  });

  it('a set score and a raise do not stack: the raise applies first, then the set if it is still higher', () => {
    const belt: InventoryItem = { id: 'b', name: 'Belt', qty: 1, equipped: true, custom: { kind: 'wondrous', abilities: [{ ability: 'str', bonus: 2 }, { ability: 'con', set: 12 }, { ability: 'dex', bonus: 2, set: 15 }] } };
    const sheet = deriveSheet(carrying(belt), rules);
    expect(sheet.abilities.str).toEqual({ score: 18, mod: 4, changes: [{ label: 'Belt: +2', to: 18 }] }); // 16 + 2
    expect(sheet.abilities.con).toEqual({ score: 14, mod: 2 }); // already higher than 12
    expect(sheet.abilities.dex).toEqual({ score: 16, mod: 3, changes: [{ label: 'Belt: +2', to: 16 }] }); // 14 + 2 = 16, past the 15
    // A raise stops at 30.
    const mighty = deriveSheet({ ...carrying({ ...belt, custom: { kind: 'wondrous', abilities: [{ ability: 'str', bonus: 20 }] } }), scores: { ...base.scores, str: 20 } }, rules);
    expect(mighty.abilities.str.score).toBe(30);
    // Hit points follow Constitution: 16 Con instead of 14 is +1 a level.
    const hardy = deriveSheet(carrying({ ...belt, custom: { kind: 'wondrous', abilities: [{ ability: 'con', set: 16 }] } }), rules);
    expect(hardy.maxHp.value).toBe(plain.maxHp.value + 5);
  });

  it('bonuses to saves and skills: one of them, or all of them, each with its own line', () => {
    const cloak: InventoryItem = { id: 'cl', name: 'Cloak of Protection', qty: 1, equipped: true, attuned: true, custom: { kind: 'wondrous', attune: true, bonuses: [{ type: 'ac', value: 1 }], saves: [{ value: 1 }], skills: [{ skill: 'stealth', value: 5 }] } };
    const sheet = deriveSheet(carrying(cloak), rules);
    for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) expect(sheet.saves[a].value, a).toBe(plain.saves[a].value + 1);
    expect(sheet.saves.wis.lines.at(-1)).toEqual({ label: 'Cloak of Protection', value: 1 });
    expect(skill(sheet, 'stealth').value).toBe(skill(plain, 'stealth').value + 5);
    expect(skill(sheet, 'stealth').lines.at(-1)).toEqual({ label: 'Cloak of Protection', value: 5 });
    expect(skill(sheet, 'perception').value).toBe(skill(plain, 'perception').value);
    expect(sheet.ac.value).toBe(plain.ac.value + 1);
    const stone: InventoryItem = { id: 'st', name: 'Luckstone', qty: 1, equipped: true, custom: { kind: 'wondrous', saves: [{ ability: 'dex', value: 2 }], skills: [{ value: 1 }] } };
    const lucky = deriveSheet(carrying(stone), rules);
    expect([lucky.saves.dex.value - plain.saves.dex.value, lucky.saves.str.value - plain.saves.str.value]).toEqual([2, 0]);
    expect(lucky.skills.every((s, i) => s.value === plain.skills[i]!.value + 1)).toBe(true);
    expect(lucky.passivePerception.value).toBe(plain.passivePerception.value + 1);
    expect(itemSummary(cloak.custom!)).toBe('Wondrous item · +1 AC · +1 to all saves · +5 to Stealth · requires attunement');
    expect(itemSummary(stone.custom!)).toBe('Wondrous item · +2 to Dex saves · +1 to all skills');
  });

  it('spells an item grants are on the spell list while it is in use, counted against no class', () => {
    const fireball = [...rules.values()].find((e) => e.kind === 'spell' && e.name === 'Fireball');
    const wand: InventoryItem = { id: 'w', name: 'Wand of Embers', qty: 1, equipped: true, custom: { kind: 'wondrous', uses: { max: 7, recharge: 'long' }, spells: [{ name: 'Fireball', level: 3, entry: fireball?.id }, { name: 'Ember Step', level: 0 }] } };
    const sheet = deriveSheet(carrying(wand), rules);
    expect(sheet.spellbook.known.map((k) => [k.name, k.level, k.item, k.ready, k.override, k.cls])).toEqual([['Ember Step', 0, 'Wand of Embers', true, false, undefined], ['Fireball', 3, 'Wand of Embers', true, false, undefined]]);
    if (fireball) expect(sheet.spellbook.known[1]!.text).toContain('8d6');
    expect(sheet.spellbook.classes.every((c) => c.known === 0 && c.cantrips === 0)).toBe(true);
    expect(sheet.resources.find((r) => r.name === 'Wand of Embers')).toMatchObject({ max: 7 });
    expect(deriveSheet(carrying({ ...wand, equipped: false }), rules).spellbook.known).toEqual([]);
    expect(carrying(wand).spells).toBeUndefined(); // never written into the saved character
    expect(itemSummary(wand.custom!)).toBe('Wondrous item · casts Fireball, Ember Step · 7 charges (long rest)');
  });

  it('attunement: three at a time by the rule, counted and said when over, never stopped; the number can be changed', () => {
    expect(plain.attunement).toMatchObject({ used: 0, over: false, items: [], max: { value: 3, calculated: 3, overridden: false } });
    expect(plain.attunement.max.lines[0]!.label).toContain('5e SRD 5.1 p. 206');
    const ringOf = (i: number, attuned: boolean): InventoryItem => ({ id: `r${i}`, name: `Ring ${i}`, qty: 1, equipped: true, attuned: attuned || undefined, custom: { kind: 'wondrous', attune: true, bonuses: [{ type: 'hp', value: 1 }] } });
    const three = deriveSheet(carrying(ringOf(1, true), ringOf(2, true), ringOf(3, true), ringOf(4, false)), rules);
    expect(three.attunement).toMatchObject({ used: 3, over: false, items: ['Ring 1', 'Ring 2', 'Ring 3'] });
    expect(three.maxHp.value).toBe(plain.maxHp.value + 3); // the fourth is worn but not attuned
    const four = deriveSheet(carrying(ringOf(1, true), ringOf(2, true), ringOf(3, true), ringOf(4, true)), rules);
    expect(four.attunement).toMatchObject({ used: 4, over: true });
    expect(four.maxHp.value).toBe(plain.maxHp.value + 4); // the player has the final say: it still works
    const more = deriveSheet({ ...carrying(ringOf(1, true), ringOf(2, true), ringOf(3, true), ringOf(4, true)), overrides: { attunement: 5 } }, rules);
    expect(more.attunement).toMatchObject({ used: 4, over: false, max: { value: 5, calculated: 3, overridden: true } });
    // Attunement stays while an item is stowed (it is a bond, not a place), and ends when it is gone.
    expect(deriveSheet(carrying({ ...ringOf(1, true), carried: false }), rules).attunement.used).toBe(1);
    expect(deriveSheet(carrying({ ...ringOf(1, true), qty: 0 }), rules).attunement.used).toBe(0);
    // An armory item is attuned to when its text says it needs it.
    // Any item can be attuned to (a plain one the DM says is magic); one whose book text says it needs it is known to.
    expect(itemNeedsAttunement({ id: 'x', name: 'Longsword', qty: 1 }, [...rules.values()].find((e) => e.kind === 'item' && e.name === 'Longsword'))).toBe(false);
    expect(itemNeedsAttunement({ id: 'x', name: 'Odd blade', qty: 1 }, { id: 'item.x', kind: 'item', name: 'Odd blade', versions: [], source: { book: 'B', page: 1 }, text: 'Weapon, Rare (requires attunement)' })).toBe(true);
    expect(deriveSheet(carrying({ id: 'd', name: 'Plain but bonded', qty: 1, attuned: true }), rules).attunement.items).toEqual(['Plain but bonded']);
  });

  it('the book’s own magic items are offered as a start, with their words, page, rarity, cost and whether they need attunement', () => {
    for (const version of ['dndf-10', 'dndf-8.8'] as const) {
      const book = loadRules(version);
      const items = bookMagicItems(book);
      // Counted a second way: every section of an armory chapter whose first line reads "<something>, <a rarity>".
      let headed = 0;
      for (const e of book.values()) for (const s of ((e.kind === 'rule' && e.id.startsWith('rule.armory_') ? e.sections : undefined) ?? []) as { text: string }[]) if (/^[A-Z][A-Za-z ]+(?: \([^)]*\))?, (?:Common|Uncommon|Rare|Very Rare|Legendary|Mythical)\b/.test(s.text.split('\n')[0]!)) headed++;
      expect(items.length, version).toBe(headed);
      expect(items.length, version).toBeGreaterThan(50);
      expect(new Set(items.map((i) => i.id)).size, version).toBe(items.length);
      for (const i of items) { expect(i.page, i.name).toBeGreaterThan(0); expect(i.text.length, i.name).toBeGreaterThan(20); expect(ITEM_KINDS, i.name).toContain(i.kind); }
    }
    const axe = bookMagicItems(rules).find((i) => i.name === 'Axe Dial')!;
    expect(axe).toMatchObject({ kind: 'wondrous', base: 'dial', rarity: 'Rare', attune: true, value: 5_000_000, chapter: expect.stringContaining('Dial') });
    expect(axe.text.startsWith('Wondrous Item (dial), Rare (requires attunement by a creature proficient with dials)')).toBe(true);
    expect(bookMagicItems(rules).some((i) => i.kind === 'weapon' && i.rarity === 'Legendary')).toBe(true);
    // Kept on an item made from one, so its page can be cited.
    expect(cleanCustomItem({ kind: 'wondrous', source: { book: axe.book, page: axe.page } })).toEqual({ kind: 'wondrous', source: { book: axe.book, page: axe.page } });
    expect(cleanCustomItem({ kind: 'wondrous', source: { book: '', page: 3 } })).toEqual({ kind: 'wondrous' });
  });

  it('the new parts are checked like the rest: bad ones dropped, saved and read back the same', () => {
    expect(cleanCustomItem({ kind: 'wondrous', attune: 'yes', abilities: [{ ability: 'int', set: 99 }, { ability: 'int', set: 5 }, { ability: 'luck', set: 19 }, { ability: 'str' }, { ability: 'wis', bonus: 2 }], saves: [{ value: 1 }, { value: 2 }, { ability: 'x', value: 1 }, { ability: 'dex', value: 0 }], skills: [{ skill: 'stealth', value: 3 }, { skill: 'juggling', value: 3 }, { value: 'x' }], spells: [{ name: ' Fireball ', level: 12 }, { level: 1 }, 'x'] }))
      .toEqual({ kind: 'wondrous', abilities: [{ ability: 'int', set: 30 }, { ability: 'wis', bonus: 2 }], saves: [{ value: 1 }], skills: [{ skill: 'stealth', value: 3 }], spells: [{ name: 'Fireball', level: 9 }] });
    const doc = carrying({ ...circlet, equipped: true, attuned: true });
    const saved = normalizeDoc(JSON.parse(JSON.stringify(doc)))!;
    expect(saved.inventory![0]).toMatchObject({ equipped: true, attuned: true, custom: circlet.custom });
    expect(deriveSheet(saved, rules).abilities.int.score).toBe(19);
    const [back] = readExport(JSON.stringify(exportFile({ characters: [doc] }, '2026-10-09T00:00:00Z'))).characters;
    expect(deriveSheet(back!, rules).abilities.int.score).toBe(19);
  });
});
