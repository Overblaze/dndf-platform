// What the deep review found, kept fixed: inputs a player, an old save or a mistake can produce
// must never take the sheet down, share a counter, or stall the app or the bot.
import { describe, expect, it } from 'vitest';
import {
  DICE_LIMITS, applyHealing, applyLevelUp, classColumns, customClassId, deriveSheet, levelUpPlan, newCharacter, normalizeDoc, parseDice, rollDice,
  type CharacterDoc, type ClassEntry, type CustomClass, type RulesVersion, type Sheet,
} from '../src';
import { loadRules } from './load';

const BOTH = ['dndf-10', 'dndf-8.8'] as RulesVersion[];
const scores = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const pools = (sheet: Sheet, name: string) => sheet.resources.filter((r) => r.name === name).map((r) => `${r.remaining}/${r.max}`);

describe.each(BOTH)('levels outside 1 to 20 (%s)', (version) => {
  const rules = loadRules(version);
  const make = (classId: string, level: number, more: Partial<CharacterDoc> = {}) => ({ ...newCharacter({ name: 'T', rulesVersion: version, classId, level, scores }, rules), ...more });

  it('every class can be planned and levelled past 20 without failing; table numbers stay at level 20', () => {
    for (const cls of [...rules.values()].filter((e): e is ClassEntry => e.kind === 'class')) {
      const twenty = make(cls.id, 20);
      const plan = levelUpPlan(twenty, rules, cls.id);
      expect(plan.classLevel, cls.name).toBe(21);
      expect(plan.columns, cls.name).toEqual([]); // nothing changes on a row that does not exist
      const next = applyLevelUp(twenty, rules, { classId: cls.id, hpRoll: null }).doc;
      const sheet = deriveSheet(next, rules);
      expect(sheet.level, cls.name).toBe(21);
      expect(classColumns(cls, 21)).toEqual(classColumns(cls, 20));
      expect(classColumns(cls, 0)).toEqual(classColumns(cls, 1));
      expect(Number.isFinite(sheet.maxHp.value) && Number.isFinite(sheet.ac.value), cls.name).toBe(true);
    }
  });

  it('a class at level 0, no classes at all, and a class the rules do not have each give a sheet and a warning, not a crash', () => {
    expect(deriveSheet({ ...make('class.warrior', 1), classes: [{ id: 'class.warrior', level: 0 }] }, rules).maxHp.value).toBeGreaterThan(0);
    expect(deriveSheet({ ...make('class.warrior', 1), classes: [] }, rules).maxHp.value).toBe(0);
    const orphan = deriveSheet({ ...make('class.warrior', 3), classes: [{ id: 'class.gone', level: 3 }], customFeatures: [{ id: 'c', name: 'Mine', text: 'kept' }] }, rules);
    expect(orphan.warnings).toEqual([`Class "class.gone" is not in the ${version} rules data.`]);
    expect(orphan.features.map((f) => f.name)).toContain('Mine'); // the player's own features still show
  });
});

describe('numbers that are not numbers', () => {
  const rules = loadRules('dndf-10');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores }, rules);

  it('a saved character with a missing, text or not-a-number score loads with 10 there, and every total is a number', () => {
    const raw = JSON.parse(JSON.stringify(base)) as { scores: Record<string, unknown> };
    raw.scores = { str: 'sixteen', dex: null, con: Number.NaN, int: 12.6, wis: 11 };
    const loaded = normalizeDoc(raw)!;
    expect(loaded.scores).toEqual({ str: 10, dex: 10, con: 10, int: 13, wis: 11, cha: 10 });
    const sheet = deriveSheet(loaded, rules);
    for (const value of [sheet.maxHp.value, sheet.ac.value, sheet.initiative.value, ...sheet.skills.map((s) => s.value)]) expect(Number.isFinite(value)).toBe(true);
  });

  it('healing from below zero starts at zero', () => {
    expect(applyHealing({ ...base.state, hp: -5 }, 3, 28).hp).toBe(3);
  });

  it('a hit die roll typed by hand is a whole number the die can show: 0 → 1, 99 → 10, 2.5 → 3 on a d10', () => {
    const gained = (roll: number) => applyLevelUp(base, rules, { classId: 'class.warrior', hpRoll: roll });
    expect([0, 99, -3, 2.5].map((roll) => gained(roll).hpGained)).toEqual([1 + 2, 10 + 2, 1 + 2, 3 + 2]);
    expect(gained(99).doc.classes[0]!.hpRolls!.at(-1)).toBe(10);
    expect(gained(Number.NaN).hpGained).toBe(6 + 2); // not a number: the average
  });
});

describe('dice have limits', () => {
  it(`at most ${DICE_LIMITS.dice} dice and ${DICE_LIMITS.sides} sides, so nobody can stall the app or the bot`, () => {
    expect(() => parseDice('999999d6')).toThrow(/999999 dice at once/);
    expect(() => parseDice('300d6 + 300d8')).toThrow(/600 dice at once/);
    expect(() => parseDice('1d1000000')).toThrow(/d1000000/);
    expect(() => parseDice('1d0')).toThrow(/d0/);
    expect(() => parseDice('1d6 + 99999999')).toThrow(/Can't add/);
    expect(parseDice(`${DICE_LIMITS.dice}d${DICE_LIMITS.sides}`).terms[0]).toMatchObject({ count: 500, sides: 1000 });
    const started = Date.now();
    expect(rollDice('500d1000', Math.random).rolls).toHaveLength(500);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('a very long line of nonsense is refused with a short message', () => {
    const message = (() => { try { parseDice('x'.repeat(5000)); return ''; } catch (e) { return (e as Error).message; } })();
    expect(message.length).toBeLessThan(80);
  });
});

describe('a weapon or feature with unreadable dice', () => {
  const rules = loadRules('dndf-10');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores }, rules);

  it('a weapon whose damage is not dice still shows, with its to-hit, the damage bonus, and a note saying what to fix', () => {
    const sheet = deriveSheet({ ...base, weapons: [{ id: 'w1', name: 'Odd', damage: 'lots', damageType: 'slashing', category: 'simple' }, { id: 'w2', name: '', damage: '', damageType: '', category: 'simple' }] }, rules);
    const odd = sheet.attacks.find((a) => a.id === 'w1')!;
    expect(odd.toHit.value).toBe(2 + 2); // Str 2 + proficiency 2
    expect(odd.damage).toBe('2'); // no dice to read: the Strength bonus alone
    expect(odd.notes).toContain('Can\'t read "lots" as dice: fix the weapon\'s damage in Edit');
    expect(sheet.attacks).toHaveLength(3); // unarmed and both weapons, none dropped
  });

  it('a custom feature with a bad roll keeps its good rolls and loses only the bad one', () => {
    const sheet = deriveSheet({ ...base, customFeatures: [{ id: 'x', name: 'Mix', text: '', rolls: [{ label: 'ok', dice: '2d6', kind: 'damage' }, { label: 'bad', dice: 'many', kind: 'damage' }, { label: 'huge', dice: '99999d6', kind: 'damage' }] }] }, rules);
    expect(sheet.features.find((f) => f.name === 'Mix')!.rolls).toEqual([{ label: 'ok', dice: '2d6', kind: 'damage' }]);
  });
});

describe('things that must stay apart', () => {
  const rules = loadRules('dndf-10');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores }, rules);
  const nav: CustomClass = { id: 'n', name: 'Nav', hitDie: 8, savingThrows: [], armor: [], weapons: [], tools: [], asiLevels: [], features: [
    { id: 'a', level: 1, name: 'Second Wind', text: '', uses: { max: 3, recharge: 'long' } },
    { id: 'b', level: 1, name: 'Trick', text: 'first', uses: { max: 1, recharge: 'short' } },
    { id: 'c', level: 1, name: 'Trick', text: 'second', uses: { max: 2, recharge: 'short' } },
  ] };

  it('a custom class feature named like a handbook feature has its own counter, and two custom features with one name have one each', () => {
    const sheet = deriveSheet({ ...base, customClasses: [nav], classes: [{ id: 'class.warrior', level: 3 }, { id: customClassId('n'), level: 1 }] }, rules);
    expect(pools(sheet, 'Second Wind').sort()).toEqual(['1/1', '3/3']);
    expect(pools(sheet, 'Trick').sort()).toEqual(['1/1', '2/2']);
    const keys = sheet.features.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(sheet.resources.map((r) => r.id)).size).toBe(sheet.resources.length);
  });

  it('a feat listed twice counts once', () => {
    const tough = [...rules.values()].find((e) => e.kind === 'feat' && e.name === 'Tough')!.id;
    const once = deriveSheet({ ...base, feats: [tough] }, rules);
    const twice = deriveSheet({ ...base, feats: [tough, tough] }, rules);
    expect(twice.maxHp.value).toBe(once.maxHp.value);
    expect(twice.features.filter((f) => f.name === 'Tough')).toHaveLength(1);
  });

  it('taking a feature off takes the options chosen under it too; putting it back returns them', () => {
    const bruiser = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.bruiser', level: 5, scores, furyFeatures: ['keep_going'] }, rules);
    expect(deriveSheet(bruiser, rules).features.map((f) => f.name)).toEqual(expect.arrayContaining(['Fury', 'Keep Going']));
    const off = deriveSheet({ ...bruiser, removedFeatures: ['class.bruiser/fury'] }, rules);
    expect(off.features.map((f) => f.name)).not.toContain('Fury');
    expect(off.features.map((f) => f.name)).not.toContain('Keep Going');
    expect(off.takenOff.map((f) => f.name)).toEqual(['Fury']);
    expect(deriveSheet({ ...bruiser, removedFeatures: [] }, rules).features.map((f) => f.name)).toContain('Keep Going');
  });
});

describe.each(BOTH)('no two things on a sheet share an id (%s)', (version) => {
  const rules = loadRules(version);
  it('every class with every subclass at level 20: feature keys, counters and switches are all distinct', () => {
    const classes = [...rules.values()].filter((e) => e.kind === 'class');
    for (const cls of classes) {
      for (const sub of [undefined, ...[...rules.values()].filter((e) => e.kind === 'subclass' && e.parent === cls.id)]) {
        const sheet = deriveSheet(newCharacter({ name: 'T', rulesVersion: version, classId: cls.id, level: 20, scores, subclass: sub?.id }, rules), rules);
        for (const [what, ids] of [['feature', sheet.features.map((f) => f.key)], ['counter', sheet.resources.map((r) => r.id)], ['switch', sheet.toggles.map((t) => t.id)]] as const) {
          expect(new Set(ids).size, `${cls.name} ${sub?.name ?? ''}: ${what} ids`).toBe(ids.length);
        }
      }
    }
  });
});

describe('a damaged or hand-edited save loads into a usable character', () => {
  const rules = loadRules('dndf-10');
  const good = JSON.parse(JSON.stringify(newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores }, rules))) as Record<string, unknown>;
  const damage: Record<string, (d: Record<string, any>) => void> = {
    'class level as text': (d) => { d.classes[0].level = 'three'; },
    'a class entry that is not an object': (d) => { d.classes.push(null, 'warrior', { level: 2 }); },
    'feats is a number': (d) => { d.feats = 5; },
    'feats holds non-text': (d) => { d.feats = [null, 7, 'feat.tough']; },
    'skills is text': (d) => { d.skills = 'athletics'; },
    'weapons is null': (d) => { d.weapons = null; },
    'a weapon with no id, name or damage': (d) => { d.weapons = [{}, null, { id: 'w', name: 'Club', damage: '1d4', damageType: 'bludgeoning', category: 'simple' }]; },
    'state is null': (d) => { d.state = null; },
    'state has text where numbers go': (d) => { d.state = { hp: 'full', tempHp: -4, exhaustion: 99, conditions: 'Prone', deathSaves: 3, spent: [] }; },
    'choices is a list': (d) => { d.choices = ['x']; },
    'choices holds non-lists': (d) => { d.choices = { furyFeatures: 'keep_going', other: [1, 'a'] }; },
    'armor is text': (d) => { d.armor = 'plate'; },
    'race is null': (d) => { d.race = null; },
    'appearance is text': (d) => { d.appearance = 'blue'; },
    'overrides is null': (d) => { d.overrides = null; },
    'overrides holds text': (d) => { d.overrides = { ac: 'high', speed: 40, maxHp: Number.NaN }; },
    'customFeatures holds null': (d) => { d.customFeatures = [null, 'x', { id: 'c', name: 'Mine', text: '' }]; },
    'willpower is missing': (d) => { delete d.willpower; },
    'an unknown handbook': (d) => { d.rulesVersion = 'dndf-99'; },
    'name is a number': (d) => { d.name = 42; },
  };

  it.each(Object.keys(damage))('%s', (name) => {
    const raw = JSON.parse(JSON.stringify(good)) as Record<string, any>;
    damage[name]!(raw);
    const doc = normalizeDoc(raw);
    expect(doc, name).not.toBeNull();
    const sheet = deriveSheet(doc!, rules); // must not throw
    expect(typeof sheet.name).toBe('string');
    for (const value of [sheet.maxHp.value, sheet.ac.value, sheet.speed.value, sheet.initiative.value]) expect(Number.isFinite(value), name).toBe(true);
    expect(Array.isArray(doc!.weapons) && Array.isArray(doc!.skills) && Array.isArray(doc!.state.conditions)).toBe(true);
    // loading twice changes nothing more
    expect(normalizeDoc(JSON.parse(JSON.stringify(doc)))).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it('keeps what was good: a damaged list loses only its bad entries', () => {
    const raw = JSON.parse(JSON.stringify(good)) as Record<string, any>;
    raw.feats = [null, 7, 'feat.tough'];
    raw.overrides = { ac: 'high', speed: 40 };
    raw.state = { ...raw.state, hp: 'full', exhaustion: 99, conditions: ['Prone', 5] };
    const doc = normalizeDoc(raw)!;
    expect(doc.feats).toEqual(['feat.tough']);
    expect(doc.overrides).toEqual({ speed: 40 });
    expect(doc.state).toMatchObject({ hp: 0, exhaustion: 6, conditions: ['Prone'] });
  });

  it('a good character comes through unchanged', () => {
    expect(normalizeDoc(JSON.parse(JSON.stringify(good)))).toEqual(JSON.parse(JSON.stringify(normalizeDoc(good))));
    const full = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores }, rules);
    expect(deriveSheet(normalizeDoc(JSON.parse(JSON.stringify(full)))!, rules).maxHp.value).toBe(deriveSheet(full, rules).maxHp.value);
  });

  it('what is not a character at all is still refused', () => {
    for (const junk of [null, 'x', 5, [], {}, { schema: 1 }, { schema: 2, classes: [], scores: {} }, { schema: 1, classes: 'warrior', scores: {} }, { schema: 1, classes: [], scores: 'high' }]) expect(normalizeDoc(junk)).toBeNull();
  });
});

describe('telling whether two copies of a character are the same', () => {
  it('field order, undefined fields and a trip through JSON make no difference; any real change does', async () => {
    const { sameDoc } = await import('../src');
    const rules = loadRules('dndf-10');
    const doc = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores }, rules);
    const reordered = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(doc))).reverse());
    expect(sameDoc(doc, reordered)).toBe(true);
    expect(sameDoc({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameDoc({ a: { y: 2, x: 1 }, list: [1, 2] }, { list: [1, 2], a: { x: 1, y: 2 } })).toBe(true);
    expect(sameDoc({ list: [1, 2] }, { list: [2, 1] })).toBe(false); // order in a list is content
    expect(sameDoc(doc, { ...doc, state: { ...doc.state, hp: doc.state.hp - 1 } })).toBe(false);
    expect(sameDoc(doc, { ...doc, notes: 'x' })).toBe(false);
    expect(sameDoc(null, undefined)).toBe(true);
    expect(sameDoc(0, '0')).toBe(false);
  });
});
