// Export and import: what goes into a file, what never does, and what a bad file can and cannot do.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, EXPORT_FORMAT, IMPORT_MAX_BYTES, TEST_CHARACTERS, deriveSheet, exportFile, exportFileName, kaito, newShip, normalizeDoc, normalizeShip, readExport,
  type CharacterDoc, type RuleEntry, type Secrets, type ShipDoc,
} from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const AT = '2026-10-09T12:00:00.000Z';
let n = 0;
const caravel = (): ShipDoc => ({ ...newShip(rules.get('shipType.caravel')!, 'Going Merry', () => `p${++n}`), crew: 8, treasury: 1_250_000, hold: [{ id: 'h1', name: 'Cola', qty: 6, tons: 0.5 }], upgrades: [{ id: 'u1', name: 'Bone ram', slots: 1, how: 'built', worth: 8_000_000 }] });

describe('export and import', () => {
  it('a character goes out and comes back the same, sheet and all', () => {
    const doc = kaito(rules);
    const file = exportFile({ characters: [doc] }, AT);
    expect(file).toMatchObject({ format: EXPORT_FORMAT, version: 1, exportedAt: AT, ships: [] });
    const back = readExport(JSON.stringify(file));
    expect(back.skipped).toEqual([]);
    expect(back.characters).toHaveLength(1);
    expect(back.characters[0]).toEqual(normalizeDoc(JSON.parse(JSON.stringify(doc))));
    expect(JSON.parse(JSON.stringify(deriveSheet(back.characters[0]!, rules)))).toEqual(JSON.parse(JSON.stringify(deriveSheet(doc, rules))));
  });

  it('every test character of both handbooks survives the trip with the same numbers', () => {
    for (const test of TEST_CHARACTERS) {
      const book = loadRules(test.version);
      const doc = test.build(book);
      const [back] = readExport(JSON.stringify(exportFile({ characters: [doc] }, AT))).characters;
      const stats = (d: CharacterDoc) => { const s = deriveSheet(d, book); return [s.name, s.level, s.maxHp.value, s.ac.value, s.speed.value, s.initiative.value, s.attacks.map((a) => `${a.name} ${a.toHit.value} ${a.damage}`), s.resources.map((r) => `${r.id} ${r.max}`), s.features.length]; };
      expect(stats(back!), test.name).toEqual(stats(doc));
    }
  });

  it('a ship goes out and comes back, without her pictures', () => {
    const doc: ShipDoc = { ...caravel(), pictures: [{ id: 'a', ref: 'ship-1/deck.jpg', kind: 'map', title: 'Deck' }], cover: 'a' };
    const file = exportFile({ ships: [doc] }, AT);
    expect(JSON.stringify(file)).not.toContain('deck.jpg');
    const [back] = readExport(JSON.stringify(file)).ships;
    expect(back).toEqual(normalizeShip(JSON.parse(JSON.stringify({ ...doc, pictures: [], cover: undefined }))));
    expect(back).toMatchObject({ name: 'Going Merry', treasury: 1_250_000, pictures: [], cover: undefined, upgrades: [{ name: 'Bone ram', how: 'built', worth: 8_000_000 }] });
  });

  it('an uploaded sheet background is left behind; a built-in one and the colours are kept', () => {
    const base = kaito(rules);
    const own = exportFile({ characters: [{ ...base, appearance: { background: { kind: 'image', ref: 'user-1/char-1/bg.jpg' }, cardOpacity: 80, cardColor: '#112233' } }] }, AT);
    expect(JSON.stringify(own)).not.toContain('bg.jpg');
    expect(own.characters[0]!.appearance).toEqual({ cardOpacity: 80, cardColor: '#112233' });
    const preset = exportFile({ characters: [{ ...base, appearance: { background: { kind: 'preset', id: 'sea' } } }] }, AT);
    expect(preset.characters[0]!.appearance).toEqual({ background: { kind: 'preset', id: 'sea' } });
    // A file made by hand that still names a picture does not bring the reference in.
    const forged = JSON.stringify({ ...own, characters: [{ ...base, appearance: { background: { kind: 'image', ref: 'someone-else/their-char/bg.jpg' } } }] });
    expect(JSON.stringify(readExport(forged))).not.toContain('someone-else');
  });

  it('a Devil Fruit is never in a file: it was never in the character’s document', () => {
    const doc = kaito(rules);
    const fruit: RuleEntry = { id: 'devilFruit.test', kind: 'devilFruit', name: 'Hidden-Name-Fruit', versions: [], source: { book: 'Secret Book', page: 9 }, description: 'Secret-description-text', features: [{ name: 'Secret-feature', text: 'Deals 3d6.', page: 9 }] } as unknown as RuleEntry;
    const secrets: Secrets = { granted: [{ key: 'devilFruit.test@secret', kind: 'owner', revealed: false, entry: fruit }], advancements: [] };
    const withFruit = deriveSheet(doc, rules, DEFAULT_SETTINGS, secrets);
    expect(withFruit.fruits.map((f) => f.name)).toEqual(['Hidden-Name-Fruit']); // the sheet has it…
    const text = JSON.stringify(exportFile({ characters: [doc] }, AT));
    for (const secret of ['Hidden-Name-Fruit', 'Secret-description-text', 'Secret-feature', 'devilFruit.test', 'Secret Book']) expect(text, secret).not.toContain(secret); // …the file does not
  });

  it('several things in one file; a file name from the one thing in it, or the day', () => {
    const file = exportFile({ characters: [kaito(rules), { ...kaito(rules), name: 'Second' }], ships: [caravel()] }, AT);
    const back = readExport(JSON.stringify(file));
    expect([back.characters.map((c) => c.name), back.ships.map((s) => s.name)]).toEqual([['Kaito Rourke', 'Second'], ['Going Merry']]);
    expect(exportFileName({ characters: [kaito(rules)] }, AT)).toBe('kaito-rourke.dndf.json');
    expect(exportFileName({ ships: [{ ...caravel(), name: 'Thousand Sunny!! ☀' }] }, AT)).toBe('thousand-sunny.dndf.json');
    expect(exportFileName({ ships: [{ ...caravel(), name: '☀☀☀' }] }, AT)).toBe('dndf-backup-2026-10-09.dndf.json');
    expect(exportFileName({ characters: [kaito(rules)], ships: [caravel()] }, AT)).toBe('dndf-backup-2026-10-09.dndf.json');
  });

  it('a bare saved character or ship is read too', () => {
    expect(readExport(JSON.stringify(kaito(rules))).characters.map((c) => c.name)).toEqual(['Kaito Rourke']);
    expect(readExport(JSON.stringify(caravel())).ships.map((s) => s.name)).toEqual(['Going Merry']);
  });

  it('what is not one of these files is refused in plain words', () => {
    expect(() => readExport('not json')).toThrow(/could not be read as JSON/);
    for (const text of ['null', '[]', '"x"', '42', '{}', '{"format":"something-else","characters":[]}', '{"schema":1}', '{"schema":2,"classes":[]}']) expect(() => readExport(text), text).toThrow(/not a DnDF export/);
    expect(() => readExport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, characters: [], ships: [] }))).toThrow(/no characters or ships/);
    expect(() => readExport(JSON.stringify({ format: EXPORT_FORMAT, version: 2, characters: [kaito(rules)] }))).toThrow(/newer version/);
    expect(() => readExport(' '.repeat(IMPORT_MAX_BYTES + 1))).toThrow(/too big/);
  });

  it('a damaged or hand-made file brings in what can be read and says what it left out', () => {
    const good = kaito(rules);
    const file = { format: EXPORT_FORMAT, version: 1, characters: [good, null, 'x', { schema: 1 }, { ...good, name: 7, scores: { str: 'lots' }, state: { hp: -50, conditions: 'all' }, inventory: 'everything', spells: [null], surges: 3 }], ships: [{ schema: 1, name: '  ', treasury: 'x', components: 'none' }, 5] };
    const back = readExport(JSON.stringify(file));
    expect(back.characters).toHaveLength(2);
    expect(back.ships).toHaveLength(1);
    expect(back.skipped).toEqual(['Character 2 in the file is not a character this version can read.', 'Character 3 in the file is not a character this version can read.', 'Character 4 in the file is not a character this version can read.', 'Ship 2 in the file is not a ship this version can read.']);
    for (const doc of back.characters) { const sheet = deriveSheet(doc, rules); expect(JSON.stringify(sheet)).not.toMatch(/NaN/); }
    expect(back.ships[0]).toMatchObject({ name: 'Our ship', treasury: 0, components: [] });
    // Nothing unexpected rides along: only fields the platform knows are kept.
    const extra = readExport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, characters: [{ ...good, __proto__: { polluted: true }, evil: '<script>', constructor: 'x' }], ships: [] }));
    expect(Object.keys(extra.characters[0]!)).not.toContain('evil');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a file with hundreds of characters brings in the first hundred and says so', () => {
    const many = { format: EXPORT_FORMAT, version: 1, characters: Array.from({ length: 130 }, () => kaito(rules)), ships: [] };
    const back = readExport(JSON.stringify(many));
    expect(back.characters).toHaveLength(100);
    expect(back.skipped).toEqual(['Only the first 100 characters were read; the file has 130.']);
  });
});
