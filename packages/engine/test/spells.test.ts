// Spells: the class lists, what a character knows, and casting with slots.
import { describe, expect, it } from 'vitest';
import { castSpell, deriveSheet, longRest, newCharacter, normalizeDoc, spellLists, type AbilityScores, type CharacterDoc, type KnownSpell, type RulesVersion } from '../src';
import { loadRules } from './load';

const scores: AbilityScores = { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 };

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('spells (%s)', (version) => {
  const rules = loadRules(version);
  const make = (classId: string, level: number, spells: KnownSpell[] = [], more: Partial<CharacterDoc> = {}) => {
    const doc: CharacterDoc = { ...newCharacter({ name: 'T', rulesVersion: version, classId, level, scores }, rules), spells, ...more };
    return { doc, sheet: deriveSheet(doc, rules) };
  };

  it('every list is offered, the character’s own class first, with no stray pieces among the names', () => {
    const lists = spellLists(make('class.priest', 5).doc, rules);
    expect(lists[0]).toMatchObject({ id: 'spellList.priest', own: true, name: 'Priest Spells' });
    expect(lists.filter((l) => l.own).length).toBe(1);
    expect(lists.at(-1)).toMatchObject({ id: 'custom', name: 'Spells printed in the handbook' });
    expect(lists.at(-1)!.spells.length).toBe(11);
    for (const list of lists) {
      expect(list.spells.length, list.name).toBeGreaterThan(10);
      for (const spell of list.spells) {
        expect(spell.name, `${list.name}: ${spell.name}`).toMatch(/^[A-Z][A-Za-z’':/\- ]+(?: \(ritual\))?$/);
        expect(spell.level).toBeGreaterThanOrEqual(0);
        expect(spell.level).toBeLessThanOrEqual(9);
      }
    }
    expect(spellLists(make('class.warrior', 5).doc, rules).some((l) => l.own)).toBe(false);
  });

  it('a Priest 5: slots, save DC and attack from Wisdom, and how many may be prepared', () => {
    const { sheet } = make('class.priest', 5);
    expect(sheet.spellbook.slots.map((s) => [s.id, s.max])).toEqual([['slots1', 4], ['slots2', 3], ['slots3', 2]]);
    expect(sheet.spellbook.casting).toHaveLength(1);
    expect(sheet.spellbook.casting[0]!.dc!.value).toBe(8 + 3 + 3);
    expect(sheet.spellbook.casting[0]!.attack!.value).toBe(3 + 3);
    expect(sheet.spellbook.limits).toContainEqual(expect.objectContaining({ label: 'Powers prepared', value: '8' })); // Wisdom modifier 3 + level 5
    expect(sheet.spellbook.limits.some((l) => /cantrips/i.test(l.label))).toBe(true);
    expect(make('class.warrior', 5).sheet.spellbook).toMatchObject({ slots: [], casting: [], known: [] });
  });

  it('known spells are listed by level, with counts, and say which slots can cast them now', () => {
    const known: KnownSpell[] = [
      { id: 'c', name: 'Cure Wounds', level: 1, list: 'spellList.priest', prepared: true },
      { id: 'a', name: 'Guidance', level: 0, list: 'spellList.priest' },
      { id: 'b', name: 'Bless', level: 1, list: 'spellList.priest' },
      { id: 'd', name: 'Revivify', level: 3, list: 'spellList.priest', prepared: true, notes: 'Needs a diamond' },
    ];
    const { doc, sheet } = make('class.priest', 5, known);
    expect(sheet.spellbook.known.map((k) => k.name)).toEqual(['Guidance', 'Bless', 'Cure Wounds', 'Revivify']);
    expect(sheet.spellbook).toMatchObject({ cantrips: 1, leveled: 3, prepared: 2 });
    const of = (s = sheet, name: string) => s.spellbook.known.find((k) => k.name === name)!;
    expect(of(sheet, 'Guidance').castableWith).toEqual([]);
    expect(of(sheet, 'Cure Wounds').castableWith).toEqual([1, 2, 3]);
    expect(of(sheet, 'Revivify')).toMatchObject({ castableWith: [3], notes: 'Needs a diamond', text: undefined });

    // Casting spends a slot of the level chosen; a cantrip spends nothing.
    const cantrip = castSpell(doc.state, sheet, of(sheet, 'Guidance'));
    expect(cantrip).toMatchObject({ summary: 'Cast Guidance', state: doc.state });
    const first = castSpell(doc.state, sheet, of(sheet, 'Cure Wounds'));
    expect(first.summary).toBe('Cast Cure Wounds: 1st-level slots 4 → 3 of 4');
    const up = castSpell(first.state, sheet, of(sheet, 'Cure Wounds'), 3);
    expect(up.summary).toBe('Cast Cure Wounds at 3rd level: 3rd-level slots 2 → 1 of 2');
    const low = castSpell(up.state, sheet, of(sheet, 'Revivify'), 1); // never below the spell's own level
    expect(low.state.spent).toEqual({ slots1: 1, slots3: 2 });
    const after = deriveSheet({ ...doc, state: low.state }, rules);
    expect(of(after, 'Revivify').castableWith).toEqual([]);
    expect(of(after, 'Cure Wounds').castableWith).toEqual([1, 2]);
    // With none left it still goes ahead, and says so.
    const dry = castSpell(low.state, after, of(after, 'Revivify'));
    expect(dry.warning).toBe('No 3rd-level slots left.');
    // A long rest brings them back.
    const rested = deriveSheet({ ...doc, state: longRest({ ...doc, state: low.state }, after).state }, rules);
    expect(rested.spellbook.slots.map((s) => s.remaining)).toEqual([4, 3, 2]);
    // No slots of that level at all: nothing is spent, and it is said.
    expect(castSpell(doc.state, sheet, { name: 'Wish', level: 9 }).warning).toBe('You have no 9th-level slots; nothing was spent.');
  });

  it('a spell the handbook prints in full comes with its words, page, and roll buttons', () => {
    const custom = spellLists(make('class.priest', 5).doc, rules).at(-1)!.spells.find((s) => s.name === 'Slime Wave')!;
    expect(custom).toMatchObject({ level: 3, entry: 'spell.slime_wave' });
    const { sheet } = make('class.priest', 5, [{ id: 'x', name: custom.name, level: custom.level, list: 'custom', entry: custom.entry }]);
    const shown = sheet.spellbook.known[0]!;
    expect(shown).toMatchObject({ school: 'conjuration', castingTime: '1 action', range: '120 feet', duration: 'Instantaneous', page: 218 });
    expect(shown.text).toBe(String(rules.get('spell.slime_wave')!.text));
    expect(shown.rolls.length).toBeGreaterThan(0);
  });

  it('a damaged list still opens; an old save has none', () => {
    const { doc } = make('class.priest', 5);
    const saved = normalizeDoc({ ...doc, spells: [null, { name: '' }, { name: 'Bless', level: 1.4 }, { id: 'q', name: 'Odd', level: 99 }] })!;
    expect(saved.spells).toEqual([{ id: 'spell-1', name: 'Bless', level: 1 }, { id: 'q', name: 'Odd', level: 9 }]);
    expect(normalizeDoc({ ...doc, spells: undefined })!.spells).toBeUndefined();
  });
});
