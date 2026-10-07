// Every class in data/rules, at every level and with every subclass, must produce a sheet:
// no missing data, hit points by the book's formula, and each limited use a number.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, type ClassEntry, type RuleEntry, type RulesVersion } from '../src';
import { loadRules } from './load';

const CLASS_NAMES: Record<RulesVersion, string[]> = {
  'dndf-10': ['Bruiser', 'Chemist', 'Conqueror', 'Devilforged', 'Hybrid', 'Marksman', 'Martial Artist', 'Oracle', 'Priest', 'Renegade', 'Tinkerer', 'Virtuoso', 'Warrior'],
  // v8.8 has the Rogue and the Skald where v10 has the Renegade and the Virtuoso.
  'dndf-8.8': ['Bruiser', 'Chemist', 'Conqueror', 'Devilforged', 'Hybrid', 'Marksman', 'Martial Artist', 'Oracle', 'Priest', 'Rogue', 'Skald', 'Tinkerer', 'Warrior'],
};
const scores = { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 };

describe.each(['dndf-10', 'dndf-8.8'] as const)('rules data for %s', (version) => {
  const rules = loadRules(version);
  const classes = [...rules.values()].filter((e): e is ClassEntry => e.kind === 'class');
  const subclassesOf = (cls: ClassEntry) => [...rules.values()].filter((e) => e.kind === 'subclass' && e.parent === cls.id);

  it('has the thirteen classes of that Expanded Handbook', () => {
    expect(classes.map((c) => c.name).sort()).toEqual(CLASS_NAMES[version]);
    for (const entry of rules.values()) {
      expect(entry.versions, entry.id).toContain(version);
      expect(entry.source.book, entry.id).toContain(version === 'dndf-10' ? 'v10' : 'v8.8');
    }
  });

  describe.each(classes.map((c) => [c.name, c] as const))('%s', (_name, cls) => {
    const subs = subclassesOf(cls);

    it('has a full class table, book pages on everything, and features in level order', () => {
      for (const column of Object.values(cls.progression?.columns ?? {})) expect(column).toHaveLength(20);
      expect(cls.features.length).toBeGreaterThan(5);
      expect(cls.features.map((f) => f.level)).toEqual([...cls.features.map((f) => f.level)].sort((a, b) => a - b));
      expect(cls.subclass?.level).toBeGreaterThanOrEqual(1);
      expect(subs.length).toBeGreaterThanOrEqual(6);
      for (const entry of [cls, ...subs] as RuleEntry[]) {
        for (const feature of entry.features ?? []) {
          expect(feature.text.length, `${entry.name}: ${feature.name}`).toBeGreaterThan(20);
          expect(feature.page, `${entry.name}: ${feature.name}`).toBeGreaterThanOrEqual(entry.source.page);
          expect(feature.level).toBeGreaterThanOrEqual(1);
          expect(feature.level).toBeLessThanOrEqual(20);
        }
      }
    });

    it('gives its first subclass features at the level the class grants a subclass', () => {
      const firstGroup = subs[0]!.group;
      for (const sub of subs.filter((s) => s.group === firstGroup)) {
        expect(sub.features![0]!.level, sub.name).toBe(cls.subclass!.level);
      }
    });

    it('derives a sheet at every level, with every subclass', () => {
      for (const subclass of [undefined, ...subs.map((s) => s.id)]) {
        for (let level = 1; level <= 20; level++) {
          const doc = newCharacter({ name: 'Test', rulesVersion: version, classId: cls.id, level, scores, subclass }, rules);
          const sheet = deriveSheet(doc, rules);
          expect(sheet.warnings, `${cls.name} ${level} ${subclass}`).toEqual([]);
          const con = sheet.abilities.con.mod; // after features that raise it (The King)
          expect(sheet.maxHp.value).toBe(cls.hitDie + (level - 1) * (cls.hitDie / 2 + 1) + con * level);
          expect(doc.state.hp).toBe(sheet.maxHp.value);
          for (const resource of sheet.resources) {
            expect(Number.isInteger(resource.max) && resource.max > 0, `${cls.name} ${level}: ${resource.name} = ${resource.max}`).toBe(true);
          }
          const expected = cls.features.filter((f) => f.level <= level).length;
          expect(sheet.features.filter((f) => f.key.startsWith(`${cls.id}/`)).length).toBeGreaterThanOrEqual(Math.min(expected, 1));
        }
      }
    });
  });
});

describe('v10 class details', () => {
  const rules = loadRules('dndf-10');

  it('shows casters their spell slots and class table values', () => {
    const priest = deriveSheet(newCharacter({ name: 'P', classId: 'class.priest', level: 5, scores }, rules), rules);
    expect(priest.resources.filter((r) => r.id.startsWith('slots')).map((r) => [r.name, r.max, r.recharge])).toEqual([
      ['1st-level slots', 4, 'long'],
      ['2nd-level slots', 3, 'long'],
      ['3rd-level slots', 2, 'long'],
    ]);
    expect(priest.classTable).toEqual([{ key: 'cantripsKnown', label: 'Cantrips Known', value: 4, from: 'Priest' }]);

    const monk = deriveSheet(newCharacter({ name: 'M', classId: 'class.martial_artist', level: 7, scores }, rules), rules);
    expect(monk.resources.find((r) => r.id === 'ki')).toMatchObject({ max: 7, recharge: 'short' });
    expect(monk.classTable.map((c) => [c.label, c.value])).toEqual([['Martial Arts Die', '1d8'], ['Ki', 7], ['Unarmored Movement', 15]]);
    expect(deriveSheet(newCharacter({ name: 'M', classId: 'class.martial_artist', level: 1, scores }, rules), rules).resources.find((r) => r.id === 'ki')).toBeUndefined();
  });

  it('keeps sub-headings and tables with their feature', () => {
    const chemist = deriveSheet(newCharacter({ name: 'C', classId: 'class.chemist', level: 2, scores }, rules), rules);
    const mutation = chemist.features.find((f) => f.name === 'Monster Mutation')!;
    expect(mutation.sections.map((s) => s.name)).toEqual(['Abomination']);
    expect(mutation.sections[0]!.tables![0]!.rows[0]).toEqual(['Large monstrosity, any alignment']);
    expect(chemist.resources.find((r) => r.name === 'Monster Mutation')).toMatchObject({ max: 2, recharge: 'short' });
  });
});
