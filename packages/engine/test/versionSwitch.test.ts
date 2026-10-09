// Moving a character to the other handbook: what carries over, what is renamed, what is not there,
// and which numbers and features differ. The original is never changed.
import { describe, expect, it } from 'vitest';
import { TEST_CHARACTERS, VERSION_RENAMES, deriveSheet, kaito, newCharacter, normalizeDoc, otherVersion, switchVersion, type CharacterDoc } from '../src';
import { loadRules } from './load';

const v10 = loadRules('dndf-10');
const v88 = loadRules('dndf-8.8');
const rulesOf = (version: string) => (version === 'dndf-10' ? v10 : v88);
const scores = { str: 14, dex: 16, con: 14, int: 10, wis: 12, cha: 14 };

describe('the version-switch report', () => {
  it('a class both handbooks have carries over whole; the little that differs between them is said', () => {
    const doc = kaito(v10); // Bruiser 7: the same class and features in both handbooks
    const before = JSON.stringify(doc);
    const report = switchVersion(doc, v10, v88, 'dndf-8.8');
    expect(JSON.stringify(doc)).toBe(before); // the original is untouched
    expect(report.doc.rulesVersion).toBe('dndf-8.8');
    expect(report.doc.classes).toEqual(doc.classes);
    expect(report).toMatchObject({ from: 'dndf-10', to: 'dndf-8.8', renamed: [], missing: [], unresolved: [] });
    expect(deriveSheet(report.doc, v88).maxHp.value).toBe(deriveSheet(doc, v10).maxHp.value);
    // Two real differences between the books for this Black Fist Bruiser: in v8.8 the style also gives
    // Bonus Proficiency, and Armament-Coated Muscles has a use per long rest.
    expect([report.gained, report.lost]).toEqual([['Bonus Proficiency'], []]);
    expect(report.numbers).toEqual([{ label: 'Armament-Coated Muscles (uses)', before: '—', after: '1 per long rest' }]);
    expect(report.same).toBe(false);
    // A character with nothing either book treats differently reports nothing at all.
    const plain = newCharacter({ name: 'Plain', rulesVersion: 'dndf-10', classId: 'class.bruiser', level: 1, scores, skills: [] }, v10);
    expect(switchVersion(plain, v10, v88, 'dndf-8.8')).toMatchObject({ renamed: [], missing: [], numbers: [], gained: [], lost: [], unresolved: [] });
  });

  it('a v8.8 Skald becomes a v10 Virtuoso: the class and its subclass are carried over under their new names', () => {
    const doc = newCharacter({ name: 'Brook', rulesVersion: 'dndf-8.8', classId: 'class.skald', level: 5, scores, subclass: 'subclass.skald.battlehymn', skills: ['performance'] }, v88);
    const report = switchVersion(doc, v88, v10, 'dndf-10');
    expect(report.doc.classes[0]).toMatchObject({ id: 'class.virtuoso', subclass: 'subclass.virtuoso.battlehymn', level: 5 });
    expect(report.renamed).toContainEqual({ what: 'Class', from: 'Skald', to: 'Virtuoso' });
    expect(report.missing).toEqual([]);
    const sheet = deriveSheet(report.doc, v10);
    expect(sheet.warnings).toEqual([]);
    expect(sheet.summary).toContain('Virtuoso 5');
    // The v10 Battlehymn is tougher: the difference in hit points is found and said, with both figures.
    expect(report.numbers).toContainEqual({ label: 'Hit point maximum', before: String(deriveSheet(doc, v88).maxHp.value), after: String(sheet.maxHp.value) });
    // "Skald School" is "Virtuoso School" there: said as one lost and one gained, not hidden.
    expect(report.lost).toContain('Skald School');
    expect(report.gained).toContain('Virtuoso School');
    // And back again: the same character it started as.
    const back = switchVersion(report.doc, v10, v88, 'dndf-8.8');
    expect(back.doc.classes).toEqual(doc.classes);
    expect(back.renamed).toContainEqual({ what: 'Class', from: 'Virtuoso', to: 'Skald' });
  });

  it('a v8.8 Rogue becomes a v10 Renegade, a reworked class: the features that go and come are listed by name', () => {
    const doc = newCharacter({ name: 'Nami', rulesVersion: 'dndf-8.8', classId: 'class.rogue', level: 5, scores, subclass: 'subclass.rogue.thief', skills: ['stealth'] }, v88);
    const report = switchVersion(doc, v88, v10, 'dndf-10');
    expect(report.doc.classes[0]).toMatchObject({ id: 'class.renegade', subclass: 'subclass.renegade.thief' });
    expect(report.renamed).toContainEqual({ what: 'Class', from: 'Rogue', to: 'Renegade' });
    expect(report.lost).toEqual(expect.arrayContaining(['Cunning Action', 'Steady Aim', 'Roguish Archetype']));
    expect(report.gained).toEqual(expect.arrayContaining(['Combo Flow', 'Finishing Act', 'Renegade Archetype']));
    expect(report.lost).not.toContain('Sneak Attack'); // the Renegade Thief still has it
    expect(report.gained.length).toBeGreaterThan(0);
    expect(report.same).toBe(false);
    // Checked against the sheets themselves: every feature said to be lost is on the old sheet and not the new, and the other way round.
    const then = new Set(deriveSheet(doc, v88).features.map((f) => f.name));
    const now = new Set(deriveSheet(report.doc, v10).features.map((f) => f.name));
    for (const name of report.lost) expect(then.has(name) && !now.has(name), name).toBe(true);
    for (const name of report.gained) expect(now.has(name) && !then.has(name), name).toBe(true);
    expect([...then].filter((n) => !now.has(n)).sort()).toEqual(report.lost);
  });

  it('what the other handbook does not have is left off the copy and said: a subclass, a race', () => {
    const smith = newCharacter({ name: 'Franky', rulesVersion: 'dndf-8.8', classId: 'class.devilforged', level: 5, scores, subclass: 'subclass.devilforged.blade_smithing', skills: [] }, v88);
    const report = switchVersion(smith, v88, v10, 'dndf-10');
    expect(report.missing).toContainEqual({ what: 'Subclass', name: v88.get('subclass.devilforged.blade_smithing')!.name });
    expect(report.doc.classes[0]).toMatchObject({ id: 'class.devilforged', subclass: undefined });
    expect(deriveSheet(report.doc, v10).warnings.filter((w) => /not in the|not one of/.test(w))).toEqual([]);
    const robot: CharacterDoc = { ...newCharacter({ name: 'Unit', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores, skills: [] }, v10), race: { id: 'race.void_century_automaton', name: 'Void Century Automaton', speed: 30 } };
    const old = switchVersion(robot, v10, v88, 'dndf-8.8');
    expect(old.missing).toContainEqual({ what: 'Race', name: v10.get('race.void_century_automaton')!.name });
    expect(old.doc.race).toMatchObject({ id: undefined, name: 'Void Century Automaton', speed: 30 }); // still called that, as the player's own
  });

  it('feats, Haki features and spell lists with another id are carried over; the rest of the character comes along', () => {
    const doc: CharacterDoc = {
      ...newCharacter({ name: 'Usopp', rulesVersion: 'dndf-8.8', classId: 'class.marksman', level: 6, scores, skills: ['perception'] }, v88),
      feats: ['feat.moderately_armorered', 'feat.alert'],
      surges: [{ id: 's1', entry: 'hakiFeature.predictive_shot', rarity: 'Uncommon' }],
      inventory: [{ id: 'i1', name: 'Kabuto', qty: 1, equipped: true, custom: { kind: 'weapon', weapon: { damage: '1d8', damageType: 'piercing', category: 'martial', ranged: true, bonus: 1 } } }],
      money: 1234, notes: 'Brave warrior of the sea', overrides: { speed: 35 },
    };
    const report = switchVersion(doc, v88, v10, 'dndf-10');
    expect(report.doc.feats).toEqual(['feat.moderately_armored', 'feat.alert']);
    expect(report.doc.surges).toEqual([{ id: 's1', entry: 'hakiFeature.predictive_attack', rarity: 'Uncommon' }]);
    expect(report.renamed).toContainEqual({ what: 'Haki feature', from: v88.get('hakiFeature.predictive_shot')!.name, to: v10.get('hakiFeature.predictive_attack')!.name });
    expect(report.missing).toEqual([]);
    expect(report.doc).toMatchObject({ money: 1234, notes: 'Brave warrior of the sea', overrides: { speed: 35 }, name: 'Usopp', scores });
    const sheet = deriveSheet(report.doc, v10);
    expect(sheet.speed.value).toBe(35);
    expect(sheet.attacks.some((a) => a.name === 'Kabuto')).toBe(true);
    expect(normalizeDoc(JSON.parse(JSON.stringify(report.doc)))).toBeTruthy();
    for (const [old, now] of VERSION_RENAMES) { expect(v88.has(old), old).toBe(true); expect(v10.has(now), now).toBe(true); }
  });

  it('every number said to change really differs between the two sheets, and none that differs is left out', () => {
    for (const test of TEST_CHARACTERS) {
      const from = rulesOf(test.version);
      const to = otherVersion(test.version);
      const doc = test.build(from);
      const report = switchVersion(doc, from, rulesOf(to), to);
      const before = deriveSheet(doc, from);
      const after = deriveSheet(report.doc, rulesOf(to));
      const said = new Map(report.numbers.map((n) => [n.label, n]));
      for (const [label, a, b] of [['Hit point maximum', before.maxHp.value, after.maxHp.value], ['Armor Class', before.ac.value, after.ac.value], ['Level', before.level, after.level], ['Willpower', before.willpower.value, after.willpower.value], ['Haki save DC', before.hakiSaveDc.value, after.hakiSaveDc.value]] as const) {
        if (a === b) expect(said.has(label), `${test.name}: ${label} unchanged but listed`).toBe(false);
        else expect(said.get(label), `${test.name}: ${label}`).toEqual({ label, before: String(a), after: String(b) });
      }
      for (const n of report.numbers) expect(n.before, `${test.name}: ${n.label}`).not.toBe(n.after);
      expect(after.level, test.name).toBe(before.level);
      expect(JSON.stringify(after), test.name).not.toMatch(/NaN/);
      // Nothing is left on the copy that its handbook cannot place.
      expect(after.warnings.filter((w) => /^"[^"]+" is not one of/.test(w)), test.name).toEqual([]);
      expect(report.same).toBe(!report.renamed.length && !report.missing.length && !report.numbers.length && !report.gained.length && !report.lost.length && !report.reworded.length && !report.unresolved.length);
    }
  });
});
