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

describe('/make', () => {
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
    expect(on.reply).toBe('🗡️ **Zoro** puts it to use: **Shell buckler** — AC 15 → **18**');
    const off = itemUse(on.doc!, resheet(on.doc!), 'shell', false, resheet);
    expect(off.reply).toBe('📦 **Zoro** puts it away: **Shell buckler** — AC 18 → **15**');
    expect(itemUse(off.doc!, resheet(off.doc!), 'shell', false, resheet)).toEqual({ reply: 'Nothing to change: **Shell buckler** is already put away.' });
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

  it('a weapon, armor or shield from the armory is readied or worn from Discord too, as the website does it', () => {
    let { doc, sheet } = stocked();
    const ready = itemUse(doc, sheet, 'longsword', true, resheet, { rules });
    expect(ready.reply).toBe('🗡️ **Zoro** readies it: **Longsword** — attack **+6** to hit, 1d8 + 3 slashing');
    expect(ready.doc!.weapons.map((w) => w.name)).toContain('Longsword');
    expect(itemUse(ready.doc!, resheet(ready.doc!), 'longsword', true, resheet, { rules }).doc).toBeUndefined(); // already readied
    const away = itemUse(ready.doc!, resheet(ready.doc!), 'longsword', false, resheet, { rules });
    expect(away.reply).toBe('📦 **Zoro** puts it away: **Longsword** — it is no longer under Attacks');
    expect(away.doc!.weapons.map((w) => w.name)).not.toContain('Longsword');
    doc = itemAdd(doc, sheet, { name: 'Chain Mail' }, armory, id, resheet).doc!; sheet = resheet(doc);
    const worn = itemUse(doc, sheet, 'chain', true, resheet, { rules });
    expect(worn.reply).toMatch(/^🗡️ \*\*Zoro\*\* puts it on: \*\*Chain Mail\*\* — .*AC 12 → \*\*16\*\*/);
    expect(itemUse(worn.doc!, resheet(worn.doc!), 'chain', false, resheet, { rules }).doc!.armor).toBeNull();
    expect(itemUse(doc, sheet, 'rations', true, resheet, { rules }).reply).toMatch(/plain item with nothing to switch on/);
  });

  it('only what can be switched on is; the rest is said plainly', () => {
    const { doc, sheet } = stocked();
    expect(itemUse(doc, sheet, 'ring', true, resheet).reply).toBe('"ring" could be: Ring of the Tides, Ring of Keys. Which one?');
    expect(itemUse(doc, sheet, 'anchor', true, resheet).reply).toMatch(/^\*\*Zoro\*\* carries nothing called "anchor"\. They have: Longsword, Rations, Ring of the Tides, Ring of Keys\.$/);
    const away = itemUse(doc, sheet, 'tides', false, resheet);
    expect(away.reply).toBe(`📦 **Zoro** puts it away: **Ring of the Tides** — speed ${sheet.speed.value} → **${sheet.speed.value - 10} ft**`);
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

describe('/make with ability scores, saves, skills, spells and attunement', () => {
  it('the Circlet of Intellect: Intelligence 10 → 19 once it is worn and attuned, and not before', () => {
    const { doc, sheet } = start();
    const made = itemMake(doc, sheet, { kind: 'wondrous', name: 'Circlet of Intellect', ability: 'int', abilityBecomes: 19, attunement: true, rarity: 'Uncommon' }, id, resheet);
    expect(made.reply.split('\n').slice(0, 3)).toEqual([
      '🛠️ **Zoro** has a new item: **Circlet of Intellect**',
      'Wondrous item · Int 19 · requires attunement · Uncommon',
      'Not in use yet. `/item use item: Circlet of Intellect` with `attune: attune` puts it to use.',
    ]);
    expect(resheet(made.doc!).abilities.int.score).toBe(10);
    const worn = itemUse(made.doc!, resheet(made.doc!), 'circlet', true, resheet);
    expect(worn.reply.split('\n')).toEqual(['🗡️ **Zoro** puts it to use: **Circlet of Intellect**.', 'It requires attunement, so it does nothing until they attune to it: add `attune: attune`.', 'Attuned to 0 of 3.']);
    expect(resheet(worn.doc!).abilities.int.score).toBe(10);
    const attuned = itemUse(worn.doc!, resheet(worn.doc!), 'circlet', true, resheet, { attune: 'attune' });
    expect(attuned.reply.split('\n')).toEqual(['🗡️ **Zoro** attunes to it: **Circlet of Intellect** — Intelligence 10 → **19** (+4)', 'Attuned to 1 of 3.']);
    expect(resheet(attuned.doc!).abilities.int).toMatchObject({ score: 19, mod: 4 });
    expect(attuned.doc!.scores.int).toBe(10); // the character itself is unchanged
    const ended = itemUse(attuned.doc!, resheet(attuned.doc!), 'circlet', true, resheet, { attune: 'end' });
    expect(ended.reply.split('\n')[0]).toBe('🗡️ **Zoro** ends the attunement: **Circlet of Intellect** — Intelligence 19 → **10** (+0)');
    // In one go.
    const now = itemMake(doc, sheet, { kind: 'wondrous', name: 'Circlet of Intellect', ability: 'int', abilityBecomes: 19, attunement: true, useNow: true }, id, resheet);
    expect(now.reply).toContain('In use and attuned now: Intelligence 10 → **19** (+4)');
    expect(now.reply).toContain('Attuned to 1 of 3.');
    expect(itemList(now.doc!, resheet(now.doc!)).reply.split('\n')).toEqual(['🎒 **Zoro**', '🗡️ **Circlet of Intellect** — Wondrous item · Int 19 · requires attunement · attuned', 'Carrying 0 lb of 240 lb.', 'Attuned to 1 of 3.']);
  });

  it('a fourth attunement is said to be over the limit and still happens', () => {
    let { doc } = start();
    for (const name of ['Ring A', 'Ring B', 'Ring C']) doc = itemMake(doc, resheet(doc), { kind: 'wondrous', name, saveBonus: 1, attunement: true, useNow: true }, id, resheet).doc!;
    const fourth = itemMake(doc, resheet(doc), { kind: 'wondrous', name: 'Ring D', saveBonus: 1, attunement: true, useNow: true }, id, resheet);
    expect(fourth.reply).toContain('Attuned to 4 of 3 — more than the rules allow; nothing is stopped.');
    expect(resheet(fourth.doc!).saves.wis.value).toBe(resheet(base).saves.wis.value + 4);
    // Any item can be attuned to, even a plain one the DM says is magic.
    const plain = itemAdd(base, resheet(base), { name: 'Odd pebble' }, armory, id, resheet).doc!;
    expect(itemUse(plain, resheet(plain), 'pebble', true, resheet, { attune: 'attune' }).reply.split('\n')).toEqual(['🗡️ **Zoro** attunes to it: **Odd pebble**.', 'Attuned to 1 of 3.']);
  });

  it('saves, a skill, a raise, and spells looked up in the rules by name', () => {
    const { doc, sheet } = start();
    const spells = [...rules.values()].filter((e) => e.kind === 'spell');
    const named = (wanted: string) => spells.find((e) => e.name.toLowerCase() === wanted.toLowerCase());
    const made = itemMake(doc, sheet, { kind: 'wondrous', name: 'Cloak', saveBonus: 1, skill: 'stealth', skillBonus: 5, ability: 'dex', abilityBonus: 2, spells: 'fireball, Mist Step ,', useNow: true }, id, resheet, named);
    expect(made.reply).toContain('Wondrous item · +2 Dex · +1 to all saves · +5 to Stealth · casts Fireball, Mist Step');
    expect(made.reply).toContain('Dexterity 14 → **16** (+3)');
    expect(made.reply).toContain('Mist Step, Fireball on the spell list');
    const custom = made.doc!.inventory![0]!.custom!;
    expect(custom.spells).toEqual([{ name: 'Fireball', level: 3, entry: named('fireball')!.id }, { name: 'Mist Step', level: 1 }]);
    const after = resheet(made.doc!);
    expect(after.skills.find((k) => k.id === 'stealth')!.value).toBe(sheet.skills.find((k) => k.id === 'stealth')!.value + 5 + 1); // +5, and +1 from the higher Dexterity
    // Said, not silently dropped.
    const odd = itemMake(doc, sheet, { kind: 'wondrous', name: 'Odd', abilityBecomes: 19, skill: 'stealth' }, id, resheet);
    expect(odd.reply).toContain('⚠️ No ability was chosen, so the ability score change was left off.');
    expect(odd.reply).toContain('⚠️ A skill was chosen but no skill_bonus, so it was left off.');
    // A skill typed by name works; one that is not a skill is said.
    expect(itemMake(doc, sheet, { kind: 'wondrous', name: 'Boots', skill: 'Sleight of Hand', skillBonus: 2 }, id, resheet).doc!.inventory![0]!.custom!.skills).toEqual([{ skill: 'sleight_of_hand', value: 2 }]);
    const bad = itemMake(doc, sheet, { kind: 'wondrous', name: 'Boots', skill: 'juggling', skillBonus: 2 }, id, resheet);
    expect(bad.reply).toContain('⚠️ "juggling" is not a skill, so the skill bonus was left off.');
    expect(bad.doc!.inventory![0]!.custom!.skills).toBeUndefined();
  });
});
