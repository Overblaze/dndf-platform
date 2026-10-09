// /item, checked against the same engine and rules data as the website's Gear tab and item maker.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, normalizeDoc, type CharacterDoc } from '@dndf/engine';
import { loadRules } from '../../packages/engine/test/load';
import { armoryMatches, findItem, itemAdd, itemList, itemMake, itemRemove, itemUse } from '../src/itemCommands';

const rules = loadRules('dndf-10');
const armory = [...rules.values()].filter((e) => e.kind === 'item');
// Warrior 5, Str 16 (+3), Dex 14 (+2), proficiency +3: unarmored AC 12, carries 240 lb.
const base = newCharacter({ name: 'Zoro', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: [] }, rules);
const resheet = (doc: CharacterDoc) => deriveSheet(doc, rules);
let n = 0;
const id = () => `i${++n}`;
const start = () => ({ doc: base, sheet: resheet(base) });

describe('/item add', () => {
  it('something from the armory comes with its weight; anything else is a plain item', () => {
    const { doc, sheet } = start();
    const sword = armory.find((e) => e.name === 'Longsword')!;
    const added = itemAdd(doc, sheet, { name: 'longsword', quantity: 2 }, armory, id, resheet);
    expect(added.doc!.inventory).toEqual([expect.objectContaining({ name: 'Longsword', qty: 2, weight: 3, item: sword.id })]);
    expect(added.reply.split('\n')[0]).toMatch(/^🎒 \*\*Zoro\*\* now carries 2 × \*\*Longsword\*\* — from the armory.*3 lb each\.$/);
    expect(added.reply).toContain('nothing was taken from the purse');
    expect(added.reply.split('\n')[1]).toBe('Carrying 6 lb of 240 lb.');
    expect(added.log).toBe('Added 2 × Longsword (Discord)');
    const byId = itemAdd(doc, sheet, { name: sword.id }, armory, id, resheet); // what the autocomplete sends
    expect(byId.doc!.inventory![0]).toMatchObject({ name: 'Longsword', qty: 1 });
    const own = itemAdd(doc, sheet, { name: '  Log Pose ', weight: 0.5, notes: 'Points to the next island' }, armory, id, resheet);
    expect(own.doc!.inventory![0]).toMatchObject({ name: 'Log Pose', qty: 1, weight: 0.5, notes: 'Points to the next island' });
    expect(own.doc!.inventory![0]!.item).toBeUndefined();
    expect(own.reply).toContain('**Log Pose** — your own, 0.5 lb each.');
    expect(itemAdd(doc, sheet, { name: '   ' }, armory, id, resheet).doc).toBeUndefined();
  });

  it('says when the load is more than they can carry, and still adds it', () => {
    const { doc, sheet } = start();
    const heavy = itemAdd(doc, sheet, { name: 'Anchor', quantity: 3, weight: 100 }, armory, id, resheet);
    expect(heavy.reply).toContain('Carrying 300 lb of 240 lb — more than they can carry.');
    expect(heavy.doc!.inventory).toHaveLength(1);
  });

  it('offers armory names as they are typed, the ones that start with it first', () => {
    const offered = armoryMatches(armory, 'sword');
    expect(offered.length).toBeGreaterThan(1);
    expect(offered.every((o) => /sword/i.test(o.name) && o.value.startsWith('item.'))).toBe(true);
    expect(armoryMatches(armory, 'long')[0]!.name).toMatch(/^Long/);
    expect(armoryMatches(armory, '').length).toBe(25);
  });
});

describe('/item make', () => {
  it('a +1 finesse weapon, put to use at once: Str +3, proficiency +3, +1 → +7 to hit', () => {
    const { doc, sheet } = start();
    const made = itemMake(doc, sheet, { kind: 'weapon', name: 'Wado Ichimonji', damage: '1d8', damageType: 'slashing', martial: true, finesse: true, weaponBonus: 1, rarity: 'Rare', description: 'A blade that cannot be broken.', weight: 3, useNow: true }, id, resheet);
    expect(made.reply.split('\n')).toEqual([
      '🛠️ **Zoro** has a new item: **Wado Ichimonji**',
      'Weapon · 1d8 slashing, +1 to hit and damage (martial, finesse) · Rare',
      '> A blade that cannot be broken.',
      'In use now: attack **+7** to hit, 1d8 + 4 slashing',
      'Carrying 3 lb of 240 lb.',
    ]);
    expect(resheet(made.doc!).attacks.find((a) => a.name === 'Wado Ichimonji')).toMatchObject({ damage: '1d8 + 4' });
    expect(made.log).toBe('Made Wado Ichimonji (Discord): Weapon · 1d8 slashing, +1 to hit and damage (martial, finesse) · Rare');
    // What the bot saves is exactly what the website reads back.
    expect(normalizeDoc(JSON.parse(JSON.stringify(made.doc)))!.inventory).toEqual(made.doc!.inventory);
  });

  it('armor and a magic shield change Armor Class when used: 12 → 15 → 18', () => {
    let { doc, sheet } = start();
    const coat = itemMake(doc, sheet, { kind: 'armor', name: 'Hide coat', armorClass: 13, armorDex: 'max2', useNow: true }, id, resheet);
    expect(coat.reply).toContain('Armor · AC 13 + Dex (max 2)');
    expect(coat.reply).toContain('In use now: AC 12 → **15**');
    doc = coat.doc!; sheet = resheet(doc);
    const shield = itemMake(doc, sheet, { kind: 'shield', name: 'Shell buckler', acBonus: 1 }, id, resheet);
    expect(shield.reply).toContain('Shield · +2 AC · +1 AC');
    expect(shield.reply).toContain('Not in use yet. `/item use item: Shell buckler` puts it to use.');
    expect(resheet(shield.doc!).ac.value).toBe(15);
    const on = itemUse(shield.doc!, resheet(shield.doc!), 'buckler', true, resheet);
    expect(on.reply).toBe('🗡️ **Zoro** puts **Shell buckler** to use: AC 15 → **18**');
    const off = itemUse(on.doc!, resheet(on.doc!), 'shell', false, resheet);
    expect(off.reply).toBe('📦 **Zoro** puts away **Shell buckler**: AC 18 → **15**');
    expect(itemUse(off.doc!, resheet(off.doc!), 'shell', false, resheet)).toEqual({ reply: '**Shell buckler** is already put away.' });
  });

  it('something with powers: numbers, charges and a roll', () => {
    const { doc, sheet } = start();
    const ring = itemMake(doc, sheet, { kind: 'wondrous', name: 'Ring of the Tides', speedBonus: 10, hpBonus: 5, charges: 3, roll: '2d6', effect: 'Resistance to cold damage', useNow: true }, id, resheet);
    expect(ring.reply).toContain('Wondrous item · +10 ft speed · +5 hit points · 3 charges (long rest) · 2d6 · Resistance to cold damage');
    expect(ring.reply).toContain(`speed ${sheet.speed.value} → **${sheet.speed.value + 10} ft** · hit point maximum ${sheet.maxHp.value} → **${sheet.maxHp.value + 5}**`);
    const after = resheet(ring.doc!);
    expect(after.resources.find((r) => r.name === 'Ring of the Tides')).toMatchObject({ max: 3 });
    const potion = itemMake(doc, sheet, { kind: 'consumable', name: 'Healing draught', roll: '2d4+2', quantity: 3 }, id, resheet);
    expect(potion.doc!.inventory![0]).toMatchObject({ qty: 3, custom: { kind: 'consumable', rolls: [{ dice: '2d4+2', kind: 'heal' }] } });
  });

  it('says plainly what it could not use, and still makes the item', () => {
    const { doc, sheet } = start();
    const odd = itemMake(doc, sheet, { kind: 'weapon', name: 'Mystery blade', damage: 'a lot', roll: 'banana', armorClass: 15, useNow: true }, id, resheet);
    expect(odd.doc!.inventory![0]).toMatchObject({ name: 'Mystery blade', custom: { kind: 'weapon' } });
    expect(odd.doc!.inventory![0]!.equipped).toBeUndefined(); // nothing to switch on
    expect(odd.reply).toContain('⚠️ Its damage "a lot" is not dice like 1d8');
    expect(odd.reply).toContain('⚠️ "banana" is not dice I can roll');
    expect(odd.reply).toContain('⚠️ The armor_class option only applies to armor');
    expect(() => resheet(odd.doc!)).not.toThrow();
    const noAc = itemMake(doc, sheet, { kind: 'armor', name: 'Coat' }, id, resheet);
    expect(noAc.reply).toContain('⚠️ No base Armor Class was given (armor_class)');
    expect(itemMake(doc, sheet, { kind: 'spaceship', name: 'X' }, id, resheet).doc).toBeUndefined();
    expect(itemMake(doc, sheet, { kind: 'gear', name: ' ' }, id, resheet)).toEqual({ reply: 'Give the item a name.' });
  });
});

describe('/item use, remove and list', () => {
  const stocked = () => {
    let doc = base;
    doc = itemAdd(doc, resheet(doc), { name: 'Longsword' }, armory, id, resheet).doc!;
    doc = itemAdd(doc, resheet(doc), { name: 'Rations', quantity: 5, weight: 2 }, armory, id, resheet).doc!;
    doc = itemMake(doc, resheet(doc), { kind: 'wondrous', name: 'Ring of the Tides', speedBonus: 10, useNow: true }, id, resheet).doc!;
    doc = itemAdd(doc, resheet(doc), { name: 'Ring of Keys' }, armory, id, resheet).doc!;
    return { doc, sheet: resheet(doc) };
  };

  it('finds the item a player meant, or asks which', () => {
    const { doc } = stocked();
    expect(findItem(doc, 'rations').found?.name).toBe('Rations');
    expect(findItem(doc, 'long').found?.name).toBe('Longsword');
    expect(findItem(doc, 'tides').found?.name).toBe('Ring of the Tides');
    expect(findItem(doc, 'ring')).toEqual({ found: undefined, close: ['Ring of the Tides', 'Ring of Keys'] });
    expect(findItem(doc, 'anchor')).toEqual({ close: [] });
  });

  it('only a made item with something to switch on can be put to use from Discord', () => {
    const { doc, sheet } = stocked();
    expect(itemUse(doc, sheet, 'longsword', true, resheet).reply).toMatch(/put to use on the website/);
    expect(itemUse(doc, sheet, 'ring', true, resheet).reply).toBe('"ring" could be: Ring of the Tides, Ring of Keys. Which one?');
    expect(itemUse(doc, sheet, 'anchor', true, resheet).reply).toMatch(/^\*\*Zoro\*\* carries nothing called "anchor"\. They have: Longsword, Rations, Ring of the Tides, Ring of Keys\.$/);
    const away = itemUse(doc, sheet, 'tides', false, resheet);
    expect(away.reply).toBe(`📦 **Zoro** puts away **Ring of the Tides**: speed ${sheet.speed.value} → **${sheet.speed.value - 10} ft**`);
  });

  it('removes some, or all', () => {
    const { doc, sheet } = stocked();
    const two = itemRemove(doc, sheet, 'rations', 2, resheet);
    expect(two.reply.split('\n')[0]).toBe('🗑️ **Zoro** has 3 × **Rations** left (2 removed).');
    expect(two.doc!.inventory!.find((i) => i.name === 'Rations')!.qty).toBe(3);
    const all = itemRemove(doc, sheet, 'rations', null, resheet);
    expect(all.reply.split('\n')[0]).toBe('🗑️ **Zoro** no longer carries **Rations**.');
    expect(all.doc!.inventory!.some((i) => i.name === 'Rations')).toBe(false);
    expect(itemRemove(doc, sheet, 'rations', 99, resheet).doc!.inventory!.some((i) => i.name === 'Rations')).toBe(false);
    // Removing an item in use takes its powers with it.
    expect(resheet(itemRemove(doc, sheet, 'tides', null, resheet).doc!).speed.value).toBe(sheet.speed.value - 10);
  });

  it('lists everything, marking what is in use', () => {
    const { doc, sheet } = stocked();
    const lines = itemList(doc, sheet).reply.split('\n');
    expect(lines[0]).toBe('🎒 **Zoro**');
    expect(lines).toContain('▫️ **Longsword** — 3 lb each');
    expect(lines).toContain('▫️ 5 × **Rations** — 2 lb each');
    expect(lines).toContain('🗡️ **Ring of the Tides** — Wondrous item · +10 ft speed');
    expect(lines.at(-1)).toBe('Carrying 13 lb of 240 lb.');
    expect(itemList(base, resheet(base)).reply).toMatch(/carries nothing yet/);
  });
});
