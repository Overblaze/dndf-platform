// Advantage and disadvantage on the sheet: from armor, from items and the player's own features, from
// wearing armor without proficiency, and from exhaustion; and the proficiencies an item can grant.
import { describe, expect, it } from 'vitest';
import { armorFromItem, cleanCustomItem, deriveSheet, edgeTargetName, grantName, itemSummary, newCharacter, normalizeDoc, type CharacterDoc, type InventoryItem, type RuleEntry, type Sheet } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const item = (name: string) => [...rules.values()].find((e) => e.kind === 'item' && e.name === name) as RuleEntry;
// Warrior 5 (heavy armor and shields, martial weapons), Str 16, Dex 14, proficiency +3.
const base = newCharacter({ name: 'Zoro', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: ['athletics'] }, rules);
const sheetOf = (doc: CharacterDoc) => deriveSheet(doc, rules);
const skill = (sheet: Sheet, id: string) => sheet.skills.find((s) => s.id === id)!;
const wearing = (...inventory: InventoryItem[]): CharacterDoc => ({ ...base, inventory });
const plain = sheetOf(base);

describe('advantage and disadvantage', () => {
  it('nothing has either by default', () => {
    expect(plain.skills.every((s) => s.edge === undefined)).toBe(true);
    expect(Object.values(plain.saves).every((s) => s.edge === undefined)).toBe(true);
    expect(plain.attacks.every((a) => a.edge === undefined)).toBe(true);
    expect(plain.initiativeEdge).toBeUndefined();
    expect(Object.values(plain.abilities).every((a) => a.edge === undefined)).toBe(true);
  });

  it('heavy armor from the armory gives disadvantage on Stealth, and only Stealth; armor that does not hinder does not', () => {
    const chain = sheetOf({ ...base, armor: armorFromItem(item('Chain Mail')) });
    expect(skill(chain, 'stealth').edge).toEqual({ mode: 'disadvantage', reasons: [{ mode: 'disadvantage', from: 'Chain Mail' }] });
    expect(chain.skills.filter((s) => s.edge).map((s) => s.id)).toEqual(['stealth']);
    expect(skill(chain, 'stealth').value).toBe(skill(plain, 'stealth').value); // the number itself is unchanged
    expect(chain.notes).toContainEqual({ label: 'Disadvantage on Dexterity (Stealth) checks', from: 'Chain Mail' });
    expect(skill(sheetOf({ ...base, armor: armorFromItem(item('Hide')) }), 'stealth').edge).toBeUndefined();
    // Every armor in the armory, checked against the armory's own column.
    for (const entry of [...rules.values()].filter((e) => e.kind === 'item' && e.itemType === 'armor')) {
      const got = skill(sheetOf({ ...base, armor: armorFromItem(entry) }), 'stealth').edge?.mode ?? 'normal';
      expect(got, entry.name).toBe(entry.stealthDisadvantage === true ? 'disadvantage' : 'normal');
    }
  });

  it('a character already wearing armory armor, saved before this was tracked, gets it by the armor’s name; the player can switch it off', () => {
    const old: CharacterDoc = { ...base, armor: { name: 'Chain Mail', base: 16, dexCap: 0 } };
    expect(skill(sheetOf(old), 'stealth').edge?.mode).toBe('disadvantage');
    expect(skill(sheetOf({ ...old, armor: { ...old.armor!, stealthDisadvantage: false } }), 'stealth').edge).toBeUndefined();
    expect(skill(sheetOf({ ...old, armor: { name: 'My own plate', base: 18, dexCap: 0 } }), 'stealth').edge).toBeUndefined(); // not in the armory: the player says
    expect(skill(sheetOf({ ...old, armor: { name: 'My own plate', base: 18, dexCap: 0, stealthDisadvantage: true } }), 'stealth').edge?.mode).toBe('disadvantage');
    const saved = normalizeDoc(JSON.parse(JSON.stringify({ ...base, armor: armorFromItem(item('Chain Mail')) })))!;
    expect(saved.armor).toMatchObject({ stealthDisadvantage: true });
  });

  it('armor the player made says for itself whether it hinders Stealth', () => {
    const plate: InventoryItem = { id: 'p', name: 'Sea-king plate', qty: 1, equipped: true, custom: { kind: 'armor', armor: { base: 18, dexCap: 0, stealthDisadvantage: true } } };
    expect(skill(sheetOf(wearing(plate)), 'stealth').edge).toEqual({ mode: 'disadvantage', reasons: [{ mode: 'disadvantage', from: 'Sea-king plate' }] });
    expect(skill(sheetOf(wearing({ ...plate, equipped: false })), 'stealth').edge).toBeUndefined();
    expect(skill(sheetOf(wearing({ ...plate, custom: { kind: 'armor', armor: { base: 18, dexCap: 0 } } })), 'stealth').edge).toBeUndefined();
    expect(itemSummary(plate.custom!)).toBe('Armor · AC 18, disadvantage on Stealth');
  });

  it('an item gives advantage or disadvantage on what it names: a skill, a save, an ability’s checks, attacks, initiative', () => {
    const cloak: InventoryItem = { id: 'c', name: 'Cloak of Elvenkind', qty: 1, equipped: true, custom: { kind: 'wondrous', edges: [{ mode: 'advantage', on: 'skill', skill: 'stealth' }] } };
    expect(skill(sheetOf(wearing(cloak)), 'stealth').edge).toEqual({ mode: 'advantage', reasons: [{ mode: 'advantage', from: 'Cloak of Elvenkind' }] });
    const charm: InventoryItem = { id: 'm', name: 'Charm', qty: 1, equipped: true, custom: { kind: 'wondrous', edges: [{ mode: 'advantage', on: 'save', ability: 'wis' }, { mode: 'disadvantage', on: 'check', ability: 'str' }, { mode: 'advantage', on: 'attack' }, { mode: 'advantage', on: 'initiative' }] } };
    const sheet = sheetOf(wearing(charm));
    expect(Object.entries(sheet.saves).filter(([, s]) => s.edge).map(([a, s]) => [a, s.edge!.mode])).toEqual([['wis', 'advantage']]);
    expect(sheet.abilities.str.edge?.mode).toBe('disadvantage');
    expect(skill(sheet, 'athletics').edge).toEqual({ mode: 'disadvantage', reasons: [{ mode: 'disadvantage', from: 'Charm' }] }); // Athletics is a Strength check
    expect(skill(sheet, 'acrobatics').edge).toBeUndefined();
    expect(sheet.attacks.every((a) => a.edge?.mode === 'advantage')).toBe(true);
    expect(sheet.initiativeEdge).toEqual({ mode: 'advantage', reasons: [{ mode: 'advantage', from: 'Charm' }] });
    // With no skill or ability named, it is all of them.
    const lucky: InventoryItem = { id: 'l', name: 'Lucky coin', qty: 1, equipped: true, custom: { kind: 'wondrous', edges: [{ mode: 'advantage', on: 'save' }, { mode: 'advantage', on: 'skill' }] } };
    const all = sheetOf(wearing(lucky));
    expect(Object.values(all.saves).every((s) => s.edge?.mode === 'advantage')).toBe(true);
    expect(all.skills.every((s) => s.edge?.mode === 'advantage')).toBe(true);
    expect(all.abilities.str.edge).toBeUndefined(); // skills, not plain ability checks
    expect(itemSummary(charm.custom!)).toBe('Wondrous item · advantage on Wis saves · disadvantage on Str checks · advantage on attack rolls · advantage on initiative');
  });

  it('advantage and disadvantage together are a straight roll, however many of each, and both reasons are kept', () => {
    const cloak: InventoryItem = { id: 'c', name: 'Cloak of Elvenkind', qty: 1, equipped: true, custom: { kind: 'wondrous', edges: [{ mode: 'advantage', on: 'skill', skill: 'stealth' }] } };
    const boots: InventoryItem = { id: 'b', name: 'Soft boots', qty: 1, equipped: true, custom: { kind: 'wondrous', edges: [{ mode: 'advantage', on: 'skill', skill: 'stealth' }] } };
    const both = sheetOf({ ...wearing(cloak, boots), armor: armorFromItem(item('Chain Mail')) });
    expect(skill(both, 'stealth').edge).toEqual({ mode: 'normal', reasons: [{ mode: 'advantage', from: 'Cloak of Elvenkind' }, { mode: 'advantage', from: 'Soft boots' }, { mode: 'disadvantage', from: 'Chain Mail' }] });
  });

  it('armor worn without proficiency: disadvantage on Strength and Dexterity checks, saves and attack rolls', () => {
    // An Oracle has no armor proficiencies at all.
    const oracle = newCharacter({ name: 'Robin', rulesVersion: 'dndf-10', classId: 'class.oracle', level: 3, scores: { str: 10, dex: 14, con: 12, int: 16, wis: 14, cha: 10 }, skills: [] }, rules);
    const sheet = sheetOf({ ...oracle, armor: armorFromItem(item('Hide')) });
    const why = 'Not proficient with medium armor';
    expect(sheet.notes.some((n) => n.label.startsWith(why))).toBe(true);
    for (const a of ['str', 'dex'] as const) { expect(sheet.saves[a].edge?.reasons, a).toContainEqual({ mode: 'disadvantage', from: why }); expect(sheet.abilities[a].edge?.mode, a).toBe('disadvantage'); }
    for (const a of ['con', 'int', 'wis', 'cha'] as const) { expect(sheet.saves[a].edge, a).toBeUndefined(); expect(sheet.abilities[a].edge, a).toBeUndefined(); }
    expect(sheet.skills.filter((s) => s.edge).map((s) => s.ability).every((a) => a === 'str' || a === 'dex')).toBe(true);
    expect(sheet.skills.filter((s) => s.ability === 'str' || s.ability === 'dex').every((s) => s.edge?.mode === 'disadvantage')).toBe(true);
    expect(sheet.attacks.every((a) => a.edge?.mode === 'disadvantage')).toBe(true);
    expect(sheet.initiativeEdge?.mode).toBe('disadvantage'); // a Dexterity check
    // The player can say they are proficient, and it goes.
    expect(sheetOf({ ...oracle, armor: { ...armorFromItem(item('Hide'))!, proficient: true } }).attacks.every((a) => a.edge === undefined)).toBe(true);
  });

  it('exhaustion: disadvantage on ability checks from level 1, on attacks and saves from level 3', () => {
    const tired = sheetOf({ ...base, state: { ...base.state, exhaustion: 1 } });
    expect(tired.skills.every((s) => s.edge?.mode === 'disadvantage')).toBe(true);
    expect(tired.abilities.int.edge).toEqual({ mode: 'disadvantage', reasons: [{ mode: 'disadvantage', from: 'Exhaustion 1' }] });
    expect(tired.initiativeEdge?.mode).toBe('disadvantage');
    expect(tired.attacks.every((a) => a.edge === undefined) && Object.values(tired.saves).every((s) => s.edge === undefined)).toBe(true);
    const spent = sheetOf({ ...base, state: { ...base.state, exhaustion: 3 } });
    expect(spent.attacks.every((a) => a.edge?.mode === 'disadvantage') && Object.values(spent.saves).every((s) => s.edge?.mode === 'disadvantage')).toBe(true);
  });
});

describe('proficiencies an item grants', () => {
  it('a skill, expertise, a saving throw, armor, weapons and a tool, all only while it is in use', () => {
    const gloves: InventoryItem = { id: 'g', name: 'Gloves of Thievery', qty: 1, equipped: true, custom: { kind: 'wondrous', grants: [{ kind: 'skill', id: 'sleight_of_hand' }, { kind: 'expertise', id: 'athletics' }, { kind: 'save', id: 'wis' }, { kind: 'armor', id: 'shields' }, { kind: 'weapon', id: 'firearms' }, { kind: 'tool', id: 'Thieves’ tools' }] } };
    const sheet = sheetOf(wearing(gloves));
    expect(skill(sheet, 'sleight_of_hand')).toMatchObject({ proficient: true, value: skill(plain, 'sleight_of_hand').value + 3 });
    expect(skill(sheet, 'athletics')).toMatchObject({ proficient: true, expertise: true, value: skill(plain, 'athletics').value + 3 }); // already proficient: doubled
    expect(sheet.saves.wis).toMatchObject({ proficient: true, value: plain.saves.wis.value + (plain.saves.wis.proficient ? 0 : 3) });
    expect(sheet.proficiencies.armor.find((p) => p.id === 'shields')).toBeDefined();
    expect(sheet.proficiencies.weapons).toContainEqual(expect.objectContaining({ id: 'firearms', from: 'Gloves of Thievery' }));
    expect(sheet.proficiencies.tools).toContainEqual(expect.objectContaining({ name: 'Thieves’ tools', from: 'Gloves of Thievery' }));
    const off = sheetOf(wearing({ ...gloves, equipped: false }));
    expect(skill(off, 'sleight_of_hand').proficient).toBe(false);
    expect(off.proficiencies.tools.some((p) => p.name === 'Thieves’ tools')).toBe(false);
    expect(itemSummary(gloves.custom!)).toBe('Wondrous item · proficiency in Sleight of Hand · expertise in Athletics · proficiency in Wis saves · proficiency with shields · proficiency with firearms weapons · proficiency with Thieves’ tools');
  });

  it('proficiency with a kind of armor from an item takes away the penalty for wearing it', () => {
    const oracle = newCharacter({ name: 'Robin', rulesVersion: 'dndf-10', classId: 'class.oracle', level: 3, scores: { str: 10, dex: 14, con: 12, int: 16, wis: 14, cha: 10 }, skills: [] }, rules);
    const badge: InventoryItem = { id: 'b', name: 'Marine badge', qty: 1, equipped: true, custom: { kind: 'wondrous', grants: [{ kind: 'armor', id: 'medium' }] } };
    const without = sheetOf({ ...oracle, armor: armorFromItem(item('Hide')) });
    const withBadge = sheetOf({ ...oracle, armor: armorFromItem(item('Hide')), inventory: [badge] });
    expect(without.attacks.every((a) => a.edge?.mode === 'disadvantage')).toBe(true);
    expect(withBadge.attacks.every((a) => a.edge === undefined)).toBe(true);
    expect(withBadge.notes.some((n) => /Not proficient/.test(n.label))).toBe(false);
  });

  it('what is saved is checked: an unknown skill, ability or kind is dropped, not read as "all of them"', () => {
    expect(cleanCustomItem({ kind: 'wondrous',
      edges: [{ mode: 'advantage', on: 'skill', skill: 'stealth' }, { mode: 'advantage', on: 'skill', skill: 'stealth' }, { mode: 'advantage', on: 'skill', skill: 'juggling' }, { mode: 'lucky', on: 'save' }, { mode: 'disadvantage', on: 'luck' }, { mode: 'disadvantage', on: 'save', ability: 'xyz' }, { mode: 'disadvantage', on: 'attack', skill: 'stealth' }],
      grants: [{ kind: 'skill', id: 'stealth' }, { kind: 'skill', id: 'juggling' }, { kind: 'save', id: 'luck' }, { kind: 'armor', id: 'plate' }, { kind: 'tool', id: '  Navigator’s tools ' }, { kind: 'spaceship', id: 'x' }, { kind: 'weapon' }],
    })).toEqual({ kind: 'wondrous', edges: [{ mode: 'advantage', on: 'skill', skill: 'stealth' }, { mode: 'disadvantage', on: 'attack' }], grants: [{ kind: 'skill', id: 'stealth' }, { kind: 'tool', id: 'Navigator’s tools' }] });
    expect(cleanCustomItem({ kind: 'armor', armor: { base: 18, dexCap: 0, stealthDisadvantage: 'yes' } })).toEqual({ kind: 'armor', armor: { base: 18, dexCap: 0 } });
    expect(edgeTargetName({ mode: 'advantage', on: 'skill' })).toBe('all skill checks');
    expect(grantName({ kind: 'armor', id: 'heavy' })).toBe('proficiency with heavy armor');
    const doc = wearing({ id: 'c', name: 'Cloak', qty: 1, equipped: true, custom: { kind: 'wondrous', edges: [{ mode: 'advantage', on: 'skill', skill: 'stealth' }], grants: [{ kind: 'skill', id: 'stealth' }] } });
    const saved = normalizeDoc(JSON.parse(JSON.stringify(doc)))!;
    expect(saved.inventory![0]!.custom).toEqual(doc.inventory![0]!.custom);
    expect(skill(sheetOf(saved), 'stealth')).toMatchObject({ proficient: true, edge: { mode: 'advantage' } });
  });
});
