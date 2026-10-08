// Features a player writes, and features borrowed from outside the character's classes.
import { describe, expect, it } from 'vitest';
import { activateFeature, deriveSheet, longRest, newCharacter, normalizeDoc, setToggle, type AbilityScores, type CharacterDoc, type CustomFeature, type RulesVersion, type Sheet } from '../src';
import { loadRules } from './load';

const BOTH = ['dndf-10', 'dndf-8.8'] as RulesVersion[];
const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const feature = (sheet: Sheet, name: string) => sheet.features.find((f) => f.name === name);
const pool = (sheet: Sheet, name: string) => sheet.resources.find((r) => r.name === name);

describe.each(BOTH)('custom features (%s)', (version) => {
  const rules = loadRules(version);
  const make = (custom: CustomFeature[], more: Partial<CharacterDoc> = {}) => {
    const doc = { ...newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level: 5, scores }, rules), customFeatures: custom, ...more };
    return { doc, sheet: deriveSheet(doc, rules) };
  };
  const plain = make([]).sheet;

  it('shows the player’s words, where it comes from, and its action', () => {
    const { sheet } = make([{ id: 'a', name: 'Sea Legs', text: 'You never lose your footing on a moving deck.', origin: 'DM boon, session 12', action: 'bonus' }]);
    expect(feature(sheet, 'Sea Legs')).toMatchObject({ text: 'You never lose your footing on a moving deck.', from: 'DM boon, session 12', book: 'Custom', action: 'bonus' });
    expect(sheet.warnings).toEqual([]);
  });

  it('adds its numbers: +1 AC, +10 ft, +2 initiative, +5 hit points, +1 to hit and +2 damage', () => {
    const { sheet } = make([{ id: 'a', name: 'Blessing', text: '', bonuses: [
      { type: 'ac', value: 1 }, { type: 'speed', value: 10 }, { type: 'initiative', value: 2 }, { type: 'hp', value: 5 }, { type: 'attack', value: 1 }, { type: 'damage', value: 2 },
    ] }]);
    expect(sheet.ac.value).toBe(plain.ac.value + 1);
    expect(sheet.speed.value).toBe(plain.speed.value + 10);
    expect(sheet.initiative.value).toBe(plain.initiative.value + 2);
    expect(sheet.maxHp.value).toBe(plain.maxHp.value + 5);
    expect(sheet.attacks[0]!.toHit.value).toBe(plain.attacks[0]!.toHit.value + 1);
    expect(sheet.ac.lines.some((l) => l.label === 'Blessing' && l.value === 1)).toBe(true); // the breakdown names it
  });

  it('a counter: 3 uses a long rest, spent by Use and back after the rest; renaming keeps what is spent', () => {
    const custom: CustomFeature = { id: 'luck', name: 'Lucky Coin', text: 'Reroll a d20.', uses: { max: 3, recharge: 'long' }, rolls: [{ label: 'Bonus', dice: '1d4', kind: 'other' }] };
    const { doc, sheet } = make([custom]);
    expect(pool(sheet, 'Lucky Coin')).toMatchObject({ max: 3, remaining: 3, recharge: 'long' });
    expect(feature(sheet, 'Lucky Coin')!.rolls).toEqual([{ label: 'Bonus', dice: '1d4', kind: 'other' }]);
    const used = { ...doc, state: activateFeature(doc.state, sheet, feature(sheet, 'Lucky Coin')!).state };
    expect(pool(deriveSheet(used, rules), 'Lucky Coin')!.remaining).toBe(2);
    const renamed = { ...used, customFeatures: [{ ...custom, name: 'Luckier Coin' }] };
    expect(pool(deriveSheet(renamed, rules), 'Luckier Coin')!.remaining).toBe(2);
    const rested = { ...used, state: longRest(used, deriveSheet(used, rules)).state };
    expect(pool(deriveSheet(rested, rules), 'Lucky Coin')!.remaining).toBe(3);
  });

  it('a switched feature counts only while its switch is on', () => {
    const { doc, sheet } = make([{ id: 'rage', name: 'Sea King’s Fury', text: '', switched: true, bonuses: [{ type: 'damage', value: 3 }], note: 'Resistance to cold damage' }]);
    expect(sheet.toggles.map((t) => t.label)).toContain('Sea King’s Fury');
    expect(sheet.notes.map((n) => n.label)).not.toContain('Resistance to cold damage');
    const on = deriveSheet({ ...doc, state: setToggle(doc.state, sheet, 'custom.rage', true).state }, rules);
    expect(on.notes.map((n) => n.label)).toContain('Resistance to cold damage');
    expect(on.attacks[0]!.damageLines.some((l) => l.label === 'Sea King’s Fury' && l.value === 3)).toBe(true);
  });

  it('two features with the same name stay apart, and the list survives saving and loading', () => {
    const { doc, sheet } = make([{ id: 'a', name: 'Gift', text: 'one', uses: { max: 1, recharge: 'short' } }, { id: 'b', name: 'Gift', text: 'two', uses: { max: 2, recharge: 'short' } }]);
    expect(sheet.features.filter((f) => f.name === 'Gift').map((f) => f.text)).toEqual(['one', 'two']);
    expect(sheet.resources.filter((r) => r.name === 'Gift').map((r) => r.max)).toEqual([1, 2]);
    expect(normalizeDoc(JSON.parse(JSON.stringify(doc)))!.customFeatures).toEqual(doc.customFeatures);
  });
});

describe('borrowed features', () => {
  const rules = loadRules('dndf-10' as RulesVersion);
  const make = (borrowed: { entry: string; name: string }[], classId = 'class.warrior', level = 5) => {
    const doc = { ...newCharacter({ name: 'T', rulesVersion: 'dndf-10' as RulesVersion, classId, level, scores }, rules), borrowedFeatures: borrowed };
    return { doc, sheet: deriveSheet(doc, rules) };
  };

  it('a Warrior with the Martial Artist’s Unarmored Defense: AC 10 + Dex 2 + Wis 1 = 13', () => {
    const { sheet } = make([{ entry: 'class.martial_artist', name: 'Unarmored Defense' }]);
    expect(sheet.ac.value).toBe(13);
    expect(feature(sheet, 'Unarmored Defense')!.from).toBe('Martial Artist (borrowed)');
    expect(sheet.warnings).toEqual([]);
  });

  it('brings its own uses, worked out from the character’s whole level: Oracle’s Insight proficiency times per long rest', () => {
    const { sheet } = make([{ entry: 'class.oracle', name: 'Oracle’s Insight' }]);
    expect(pool(sheet, 'Oracle’s Insight')).toMatchObject({ max: 3, recharge: 'long' });
  });

  it('brings the pool it spends: Stunning Strike comes with ki for a 5th-level character, and Use spends one', () => {
    const { doc, sheet } = make([{ entry: 'class.martial_artist', name: 'Stunning Strike' }]);
    const ki = sheet.resources.find((r) => r.id === 'ki')!;
    expect(ki.max).toBe(5);
    const used = deriveSheet({ ...doc, state: activateFeature(doc.state, sheet, feature(sheet, 'Stunning Strike')!).state }, rules);
    expect(used.resources.find((r) => r.id === 'ki')!.remaining).toBe(4);
    expect(make([]).sheet.resources.find((r) => r.id === 'ki')).toBeUndefined();
  });

  it('a subclass feature and an option can be borrowed; one the character already has is not doubled; an unknown one warns', () => {
    expect(make([{ entry: 'subclass.marksman.gunslinger', name: 'Quick-draw' }]).sheet.initiative.value).toBe(2 + 1); // Dex 2 + Wis 1
    const fury = (rules.get('optionGroup.bruiser_fury')!.options as { name: string }[])[0]!.name;
    expect(feature(make([{ entry: 'optionGroup.bruiser_fury', name: fury }]).sheet, fury)).toBeDefined();
    const own = make([{ entry: 'class.warrior', name: 'Second Wind' }]).sheet;
    expect(own.features.filter((f) => f.name === 'Second Wind')).toHaveLength(1);
    expect(make([{ entry: 'class.warrior', name: 'No Such Thing' }]).sheet.warnings).toEqual(['Borrowed feature "No Such Thing" is not in the rules data.']);
  });
});
