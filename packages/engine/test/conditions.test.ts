// Conditions on the sheet, and resistances, immunities and vulnerabilities (5e SRD 5.1 pp. 97, 358–359).
import { describe, expect, it } from 'vitest';
import { CONDITIONS, CONDITION_EFFECTS, DAMAGE_TYPES, cleanDefenses, damageAfterDefenses, defensesInText, deriveSheet, itemSummary, newCharacter, normalizeDoc, type CharacterDoc, type Defenses, type InventoryItem, type Sheet } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const base = newCharacter({ name: 'Zoro', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: ['athletics'] }, rules);
const withConditions = (...conditions: string[]): Sheet => deriveSheet({ ...base, state: { ...base.state, conditions } }, rules);
const plain = deriveSheet(base, rules);
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const modes = (sheet: Sheet) => ({
  attacks: [...new Set(sheet.attacks.map((a) => a.edge?.mode ?? 'normal'))].join(),
  checks: [...new Set(sheet.skills.map((s) => s.edge?.mode ?? 'normal'))].join(),
  saves: ABILITIES.map((a) => (sheet.saves[a].autoFail ? 'fail' : sheet.saves[a].edge?.mode ?? 'normal')).join(),
  speed: sheet.speed.value,
});
const untouched = { attacks: 'normal', checks: 'normal', saves: 'normal,normal,normal,normal,normal,normal', speed: plain.speed.value };

describe('conditions', () => {
  it('the rules data has the SRD’s words for all fourteen, with their pages', () => {
    const entry = rules.get('rule.srd_conditions')!;
    const sections = entry.sections as { name: string; text: string; page: number }[];
    expect(sections.map((s) => s.name)).toEqual([...CONDITIONS]);
    expect(entry.source).toEqual({ book: '5e SRD 5.1', page: 358 });
    expect(sections.find((s) => s.name === 'Poisoned')).toEqual({ name: 'Poisoned', text: '• A poisoned creature has disadvantage on attack rolls and ability checks.', page: 359 });
    expect(sections.find((s) => s.name === 'Paralyzed')!.text.split('\n')).toEqual([
      '• A paralyzed creature is incapacitated (see the condition) and can’t move or speak.',
      '• The creature automatically fails Strength and Dexterity saving throws.',
      '• Attack rolls against the creature have advantage.',
      '• Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.',
    ]);
    for (const s of sections) { expect(s.text, s.name).not.toMatch(/System Reference Document|\s{2}/); expect([358, 359], s.name).toContain(s.page); }
    // Every condition the engine acts on is one the document defines, and the other way round.
    expect(Object.keys(CONDITION_EFFECTS).sort()).toEqual([...CONDITIONS].sort());
  });

  it('none: nothing changes', () => {
    expect(modes(plain)).toEqual(untouched);
    expect(plain.conditions).toEqual([]);
    expect(plain.protections).toEqual({ resist: [], immune: [], vulnerable: [], conditions: [] });
  });

  it('each condition does to the sheet what its text says, and no more', () => {
    const fail = 'fail,fail,normal,normal,normal,normal';
    const expected: Record<string, Partial<typeof untouched>> = {
      Blinded: { attacks: 'disadvantage' },
      Charmed: {}, Deafened: {}, Incapacitated: {},
      Frightened: { attacks: 'disadvantage', checks: 'disadvantage' },
      Grappled: { speed: 0 },
      Invisible: { attacks: 'advantage' },
      Paralyzed: { speed: 0, saves: fail },
      Petrified: { speed: 0, saves: fail },
      Poisoned: { attacks: 'disadvantage', checks: 'disadvantage' },
      Prone: { attacks: 'disadvantage' },
      Restrained: { speed: 0, attacks: 'disadvantage', saves: 'normal,disadvantage,normal,normal,normal,normal' },
      Stunned: { speed: 0, saves: fail },
      Unconscious: { speed: 0, saves: fail },
    };
    expect(Object.keys(expected).sort()).toEqual([...CONDITIONS].sort());
    for (const name of CONDITIONS) expect(modes(withConditions(name)), name).toEqual({ ...untouched, ...expected[name] });
    // Checked against the document's own words: where the text says the creature's own attacks, checks or saves
    // are affected, the sheet does it; where it does not say so, the sheet leaves them alone.
    const text = Object.fromEntries((rules.get('rule.srd_conditions')!.sections as { name: string; text: string }[]).map((s) => [s.name, s.text]));
    for (const name of CONDITIONS) {
      const m = modes(withConditions(name));
      expect(/creature’s attack rolls have disadvantage|disadvantage on (ability checks and )?attack rolls|has disadvantage on attack rolls/.test(text[name]!), `${name} attacks`).toBe(m.attacks === 'disadvantage');
      expect(/creature’s attack rolls have advantage/.test(text[name]!), `${name} attacks adv`).toBe(m.attacks === 'advantage');
      expect(/disadvantage on (attack rolls and )?ability checks/.test(text[name]!), `${name} checks`).toBe(m.checks === 'disadvantage');
      expect(/automatically fails Strength and Dexterity saving throws/.test(text[name]!), `${name} saves`).toBe(m.saves === fail);
      expect(/speed becomes 0|can’t move/.test(text[name]!), `${name} speed`).toBe(m.speed === 0);
    }
  });

  it('says why on the roll, lists what it does under In effect, and keeps the bonus itself unchanged', () => {
    const sheet = withConditions('Poisoned');
    expect(sheet.attacks[0]!.edge).toEqual({ mode: 'disadvantage', reasons: [{ mode: 'disadvantage', from: 'Poisoned' }] });
    expect(sheet.attacks[0]!.toHit.value).toBe(plain.attacks[0]!.toHit.value);
    expect(sheet.skills.find((s) => s.id === 'athletics')!.value).toBe(plain.skills.find((s) => s.id === 'athletics')!.value);
    expect(sheet.initiativeEdge?.mode).toBe('disadvantage'); // initiative is an ability check
    expect(sheet.abilities.str.edge?.mode).toBe('disadvantage');
    expect(sheet.saves.con.edge).toBeUndefined(); // poisoned does not touch saves
    expect(sheet.notes).toContainEqual({ label: 'Disadvantage on attack rolls and ability checks', from: 'Poisoned' });
    expect(sheet.conditions).toEqual([{ name: 'Poisoned', known: true, effects: ['Disadvantage on attack rolls and ability checks'] }]);
    const held = withConditions('Paralyzed');
    expect(held.speed.lines.at(-1)).toEqual({ label: 'Paralyzed: speed 0', value: -plain.speed.value });
    expect(held.saves.str.autoFail).toBe('Paralyzed');
    expect(held.saves.wis.autoFail).toBeUndefined();
  });

  it('conditions stack with everything else, and one advantage with one disadvantage is a straight roll', () => {
    const both = withConditions('Invisible', 'Poisoned');
    expect(both.attacks[0]!.edge).toEqual({ mode: 'normal', reasons: [{ mode: 'advantage', from: 'Invisible' }, { mode: 'disadvantage', from: 'Poisoned' }] });
    const three = withConditions('Poisoned', 'Prone', 'Restrained');
    expect(three.attacks[0]!.edge!.reasons.map((r) => r.from)).toEqual(['Poisoned', 'Prone', 'Restrained']);
    expect(three.speed.value).toBe(0);
    // The same condition twice is one condition.
    expect(withConditions('Poisoned', 'Poisoned').conditions).toHaveLength(1);
  });

  it('a condition the player types in is kept as a note and changes nothing', () => {
    const sheet = withConditions('Soaked in seawater', '  ', 'x'.repeat(90));
    expect(modes(sheet)).toEqual(untouched);
    expect(sheet.conditions.map((c) => [c.name.length <= 40, c.known, c.effects])).toEqual([[true, false, []], [true, false, []]]);
    expect(sheet.notes).toContainEqual({ label: 'Soaked in seawater', from: 'Condition' });
  });

  it('immune to a condition: it can be marked, and does nothing', () => {
    const doc: CharacterDoc = { ...base, defenses: { conditions: ['Poisoned', 'frightened'] }, state: { ...base.state, conditions: ['Poisoned', 'Prone'] } };
    const sheet = deriveSheet(doc, rules);
    expect(sheet.conditions).toEqual([{ name: 'Poisoned', known: true, immune: 'Your own', effects: [] }, { name: 'Prone', known: true, effects: CONDITION_EFFECTS.Prone!.notes }]);
    expect(sheet.skills.every((s) => s.edge === undefined)).toBe(true); // poisoned would have given disadvantage on checks
    expect(sheet.attacks[0]!.edge).toEqual({ mode: 'disadvantage', reasons: [{ mode: 'disadvantage', from: 'Prone' }] });
    expect(sheet.notes).toContainEqual({ label: 'Poisoned: immune (Your own), so it does nothing', from: 'Poisoned' });
    expect(sheet.protections.conditions).toEqual([{ what: 'poisoned', from: 'Your own' }, { what: 'frightened', from: 'Your own' }]);
  });
});

describe('resistances, immunities and vulnerabilities', () => {
  const none: Defenses = { resist: [], immune: [], vulnerable: [], conditions: [] };
  it('resistance halves (rounded down), vulnerability doubles, immunity takes none; resistance first when both', () => {
    const d: Defenses = { ...none, resist: [{ what: 'fire', from: 'Ring' }], immune: [{ what: 'poison', from: 'Race' }], vulnerable: [{ what: 'cold', from: 'Curse' }] };
    expect(damageAfterDefenses(15, 'fire', d)).toEqual({ amount: 7, why: 'resistance to fire (Ring): halved' });
    expect(damageAfterDefenses(15, 'Cold ', d)).toEqual({ amount: 30, why: 'vulnerable to cold (Curse): doubled' });
    expect(damageAfterDefenses(15, 'poison', d)).toEqual({ amount: 0, why: 'immune to poison (Race)' });
    expect(damageAfterDefenses(15, 'slashing', d)).toEqual({ amount: 15, why: null });
    expect(damageAfterDefenses(15, undefined, d)).toEqual({ amount: 15, why: null });
    expect(damageAfterDefenses(1, 'fire', d).amount).toBe(0);
    const both: Defenses = { ...none, resist: [{ what: 'fire', from: 'A' }], vulnerable: [{ what: 'fire', from: 'B' }] };
    expect(damageAfterDefenses(25, 'fire', both).amount).toBe(24); // 25 halved is 12, doubled is 24
    expect(damageAfterDefenses(20, 'thunder', { ...none, resist: [{ what: 'all', from: 'Petrified' }] })).toEqual({ amount: 10, why: 'resistance to all damage (Petrified): halved' });
    expect(damageAfterDefenses(-5, 'fire', d).amount).toBe(0);
  });

  it('come from the player’s own list, from items in use, and from a feature’s plain note', () => {
    const ring: InventoryItem = { id: 'r', name: 'Ring of Warmth', qty: 1, equipped: true, custom: { kind: 'wondrous', defenses: { resist: ['cold'], conditions: ['frightened'] }, note: 'Immunity to poison damage' } };
    const doc: CharacterDoc = { ...base, defenses: { resist: ['Fire'], vulnerable: ['psychic'] }, inventory: [ring] };
    const sheet = deriveSheet(doc, rules);
    expect(sheet.protections.resist).toEqual([{ what: 'fire', from: 'Your own' }, { what: 'cold', from: 'Ring of Warmth' }]);
    expect(sheet.protections.vulnerable).toEqual([{ what: 'psychic', from: 'Your own' }]);
    expect(sheet.protections.immune).toEqual([{ what: 'poison', from: 'Ring of Warmth' }]); // read from its note
    expect(sheet.protections.conditions).toEqual([{ what: 'frightened', from: 'Ring of Warmth' }]);
    expect(deriveSheet({ ...doc, inventory: [{ ...ring, equipped: false }] }, rules).protections.resist).toEqual([{ what: 'fire', from: 'Your own' }]);
    expect(itemSummary(ring.custom!)).toBe('Wondrous item · resistance to cold · can’t be frightened · Immunity to poison damage');
    // The ring makes a marked Frightened do nothing.
    const scared = deriveSheet({ ...doc, state: { ...doc.state, conditions: ['Frightened'] } }, rules);
    expect(scared.conditions[0]).toMatchObject({ name: 'Frightened', immune: 'Ring of Warmth' });
    expect(scared.attacks[0]!.edge).toBeUndefined();
  });

  it('petrified brings its own: resistance to all damage, immunity to poison', () => {
    const stone = withConditions('Petrified');
    expect(stone.protections.resist).toContainEqual({ what: 'all', from: 'Petrified' });
    expect(stone.protections.immune).toEqual(expect.arrayContaining([{ what: 'poison', from: 'Petrified' }]));
    expect(damageAfterDefenses(30, 'slashing', stone.protections).amount).toBe(15);
    expect(damageAfterDefenses(30, 'poison', stone.protections).amount).toBe(0);
  });

  it('only a plain list of damage types is read from a note; a longer sentence stays a note', () => {
    expect(defensesInText('Resistance to cold damage')).toEqual([{ kind: 'resist', what: 'cold' }]);
    expect(defensesInText('Resistance to fire, cold and lightning damage.')).toEqual([{ kind: 'resist', what: 'fire' }, { kind: 'resist', what: 'cold' }, { kind: 'resist', what: 'lightning' }]);
    expect(defensesInText('Immune to poison')).toEqual([{ kind: 'immune', what: 'poison' }]);
    expect(defensesInText('Vulnerability to fire damage')).toEqual([{ kind: 'vulnerable', what: 'fire' }]);
    expect(defensesInText('Resistance to all damage')).toEqual([{ kind: 'resist', what: 'all' }]);
    for (const text of ['Resistance to being charmed', 'Resistance to bludgeoning damage from nonmagical attacks', 'Advantage on saves against poison', 'Resistance to', '']) expect(defensesInText(text), text).toEqual([]);
    expect(DAMAGE_TYPES).toHaveLength(13);
  });

  it('the player’s list is saved tidy, and read back the same', () => {
    expect(cleanDefenses({ resist: [' Fire ', 'fire', '', 7, 'COLD'], immune: 'poison', vulnerable: [], conditions: ['Poisoned'], luck: ['x'] })).toEqual({ resist: ['fire', 'cold'], conditions: ['poisoned'] });
    expect(cleanDefenses({})).toBeUndefined();
    expect(cleanDefenses(null)).toBeUndefined();
    const doc: CharacterDoc = { ...base, defenses: { resist: ['fire'], conditions: ['poisoned'] }, state: { ...base.state, conditions: ['Poisoned', 'Soaked'] } };
    const saved = normalizeDoc(JSON.parse(JSON.stringify(doc)))!;
    expect(saved.defenses).toEqual(doc.defenses);
    expect(saved.state.conditions).toEqual(['Poisoned', 'Soaked']);
    expect(normalizeDoc(JSON.parse(JSON.stringify(base)))!.defenses).toBeUndefined();
  });
});
