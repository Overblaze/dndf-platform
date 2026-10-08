// Spells: the class lists, what a character knows, and casting with slots.
import { describe, expect, it } from 'vitest';
import { CUSTOM_SPELL_BOOK, SRD_BOOK, castSpell, cleanCustomSpell, deriveSheet, learnCustomSpell, longRest, newCharacter, normalizeDoc, spellEntryFor, spellLists, type AbilityScores, type CharacterDoc, type KnownSpell, type RulesVersion } from '../src';
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

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('spell text from the 5e SRD (%s)', (version) => {
  const rules = loadRules(version);
  const doc = newCharacter({ name: 'T', rulesVersion: version, classId: 'class.priest', level: 9, scores }, rules);
  const lists = spellLists(doc, rules).filter((l) => l.id !== 'custom');
  const srd = [...rules.values()].filter((e) => e.kind === 'spell' && e.source.book === SRD_BOOK);

  it('holds all 319 SRD spells, each with its page, level, school and the four lines every spell has', () => {
    expect(srd).toHaveLength(319);
    for (const spell of srd) {
      expect(spell.source.page, spell.name).toBeGreaterThanOrEqual(114);
      expect(spell.source.page, spell.name).toBeLessThanOrEqual(193);
      expect(typeof spell.level === 'number' && spell.level >= 0 && spell.level <= 9, spell.name).toBe(true);
      for (const key of ['school', 'castingTime', 'range', 'components', 'duration', 'text']) expect(String(spell[key] ?? '').length, `${spell.name} ${key}`).toBeGreaterThan(0);
      expect(String(spell.text), spell.name).not.toMatch(/ |­|\s{2}|[#*|]/);
    }
  });

  it('every class-list spell that is in the SRD is at the level the SRD gives it', () => {
    let linked = 0;
    const wrong: string[] = [];
    for (const list of lists) {
      for (const spell of list.spells) {
        const entry = spell.entry ? rules.get(spell.entry) : undefined;
        if (!entry) continue;
        linked++;
        if (entry.level !== spell.level) wrong.push(`${list.name}: ${spell.name} is listed at ${spell.level}, the SRD has it at ${String(entry.level)}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(linked).toBeGreaterThan(400); // the same spell is on several lists
  });

  it('names the lists print with a wizard’s name find the SRD’s plain one; a spell from another book finds nothing', () => {
    expect(spellEntryFor('Melf’s Acid Arrow', rules)?.name).toBe('Acid Arrow');
    expect(spellEntryFor('Leomund’s Tiny Hut', rules)?.name).toBe('Tiny Hut');
    expect(spellEntryFor('Otto’s Irresistible Dance', rules)?.name).toBe('Irresistible Dance');
    expect(spellEntryFor('Feather Fall', rules)?.source.book).toBe(SRD_BOOK);
    expect(spellEntryFor('Absorb Elements', rules)).toBeUndefined();
    expect(spellEntryFor('Booming Blade', rules)).toBeUndefined();
    expect(spellEntryFor('Slime Wave', rules)?.source.book).not.toBe(SRD_BOOK); // the handbook's own
  });

  it('a known SRD spell comes with its words, page, ritual mark, table and roll buttons', () => {
    const sheet = deriveSheet({ ...doc, spells: [
      { id: 'a', name: 'Fireball', level: 3, list: 'spellList.tinkerer', entry: 'spell.fireball' },
      { id: 'b', name: 'Detect Magic', level: 1, entry: 'spell.detect_magic' },
      { id: 'c', name: 'Teleport', level: 7, entry: 'spell.teleport' },
    ] }, rules);
    const of = (name: string) => sheet.spellbook.known.find((k) => k.name === name)!;
    expect(of('Fireball')).toMatchObject({ school: 'evocation', castingTime: '1 action', range: '150 feet', duration: 'Instantaneous', book: SRD_BOOK, page: 144 });
    expect(of('Fireball').text).toMatch(/^A bright streak flashes from your pointing finger/);
    expect(of('Fireball').rolls.map((r) => r.dice)).toContain('8d6');
    expect(of('Detect Magic').ritual).toBe(true);
    expect(of('Teleport').tables![0]!.rows[0]).toEqual(['Familiarity', 'Mishap', 'Similar Area', 'Off Target', 'On Target']);
  });

  it('how much of the class lists now has text', () => {
    const names = new Map<string, boolean>();
    for (const list of lists) for (const spell of list.spells) names.set(spell.name.replace(/ \(ritual\)$/, ''), Boolean(spell.entry));
    const withText = [...names.values()].filter(Boolean).length;
    expect(names.size).toBe(version === 'dndf-10' ? 324 : 345);
    expect(withText).toBe(version === 'dndf-10' ? 215 : 222);
  });
});

describe('spells a player writes', () => {
  const rules = loadRules('dndf-10');
  const doc = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.priest', level: 5, scores }, rules);
  const zap = { id: 'lib-1', name: '  Storm Lance ', level: 2.4, school: 'evocation', castingTime: '1 action', range: '60 feet', duration: 'Instantaneous', ritual: true, text: 'A lance of lightning. The target takes 3d8 lightning damage, or regains 1d4 hit points if it is you.' };

  it('a typed spell is tidied: trimmed name, a whole level from 0 to 9, text parts as text, and no name means no spell', () => {
    expect(cleanCustomSpell(zap)).toEqual({ id: 'lib-1', name: 'Storm Lance', level: 2, school: 'evocation', castingTime: '1 action', range: '60 feet', duration: 'Instantaneous', ritual: true, text: zap.text });
    expect(cleanCustomSpell({ name: 'X', level: 99, range: 7, ritual: 'yes', text: 5 }, 'made')).toEqual({ id: 'made', name: 'X', level: 9, text: '' });
    expect(cleanCustomSpell({ name: '   ', level: 1 }, 'a')).toBeNull();
    expect(cleanCustomSpell({ name: 'No id' })).toBeNull();
    expect(cleanCustomSpell(null)).toBeNull();
  });

  it('learning one copies it onto the character: its words, lines, ritual mark and dice are on the sheet with no library at hand', () => {
    const known = learnCustomSpell(cleanCustomSpell(zap)!, 'k1');
    expect(known).toEqual({ id: 'k1', name: 'Storm Lance', level: 2, own: { school: 'evocation', castingTime: '1 action', range: '60 feet', duration: 'Instantaneous', ritual: true, text: zap.text } });
    const shown = deriveSheet({ ...doc, spells: [known] }, rules).spellbook.known[0]!;
    expect(shown).toMatchObject({ name: 'Storm Lance', level: 2, school: 'evocation', range: '60 feet', ritual: true, book: CUSTOM_SPELL_BOOK, page: undefined, text: zap.text, castableWith: [2, 3] });
    expect(shown.rolls).toEqual([{ label: '3d8 lightning damage', dice: '3d8', kind: 'damage' }, { label: '1d4 hit points', dice: '1d4', kind: 'heal' }]);
  });

  it('survives a save, and a damaged one still opens', () => {
    const known = learnCustomSpell(cleanCustomSpell(zap)!, 'k1');
    expect(normalizeDoc(JSON.parse(JSON.stringify({ ...doc, spells: [known] })))!.spells).toEqual([known]);
    const odd = normalizeDoc({ ...doc, spells: [{ id: 'a', name: 'Odd', level: 1, own: { text: 9, range: {}, ritual: 1, school: 'x'.repeat(900) } }, { id: 'b', name: 'Null', level: 1, own: null }] })!;
    expect(odd.spells![0]!.own).toEqual({ text: '', school: 'x'.repeat(200) });
    expect(odd.spells![1]!.own).toEqual({ text: '' });
    expect(() => deriveSheet(odd, rules)).not.toThrow();
    expect(() => deriveSheet({ ...doc, spells: [{ id: 'a', name: 'Raw', level: 1, own: 'nope' as never }] }, rules)).not.toThrow();
  });
});
