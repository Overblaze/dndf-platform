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
    expect(names.size).toBe(version === 'dndf-10' ? 345 : 369);
    expect(withText).toBe(version === 'dndf-10' ? 228 : 237);
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

describe('spells by class: preparing, learning, and multiclassing (EH10 p.210)', () => {
  const rules = loadRules('dndf-10');
  const cast: AbilityScores = { str: 10, dex: 12, con: 14, int: 16, wis: 16, cha: 14 };
  const make = (classes: { id: string; level: number }[], spells: KnownSpell[] = []) => {
    const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: classes[0]!.id, level: classes[0]!.level, scores: cast }, rules);
    const doc: CharacterDoc = { ...base, classes: [base.classes[0]!, ...classes.slice(1)], spells };
    return { doc, sheet: deriveSheet(doc, rules) };
  };
  const cls = (sheet: ReturnType<typeof make>['sheet'], id: string) => sheet.spellbook.classes.find((c) => c.id === `class.${id}`)!;

  it('a class that prepares (Priest, Chemist, Tinkerer) and a class that learns (Oracle, Virtuoso, Marksman, Hybrid) say so, with their own limits', () => {
    const priest = cls(make([{ id: 'class.priest', level: 5 }]).sheet, 'priest');
    expect(priest).toMatchObject({ mode: 'prepared', cantripsMax: 4, preparedMax: 8, knownMax: undefined, maxSpellLevel: 3, list: 'spellList.priest' }); // Wisdom +3 + level 5
    expect(priest.dc!.value).toBe(14);
    expect(cls(make([{ id: 'class.chemist', level: 5 }]).sheet, 'chemist')).toMatchObject({ mode: 'prepared', preparedMax: 8 });
    expect(cls(make([{ id: 'class.tinkerer', level: 5 }]).sheet, 'tinkerer')).toMatchObject({ mode: 'prepared', preparedMax: 8 }); // Intelligence +3 + 5
    const oracle = cls(make([{ id: 'class.oracle', level: 5 }]).sheet, 'oracle');
    expect(oracle).toMatchObject({ mode: 'known', cantripsMax: 4, knownMax: 8, preparedMax: undefined, maxSpellLevel: 3 });
    const virtuoso = cls(make([{ id: 'class.virtuoso', level: 5 }]).sheet, 'virtuoso');
    expect(virtuoso).toMatchObject({ mode: 'known', cantripsMax: 3, knownMax: 8 });
    expect(virtuoso.dc!.value).toBe(8 + 3 + 2); // its own formula, from Charisma
    expect(cls(make([{ id: 'class.marksman', level: 5 }]).sheet, 'marksman')).toMatchObject({ mode: 'known', knownMax: 4, cantripsMax: undefined });
    expect(cls(make([{ id: 'class.hybrid', level: 5 }]).sheet, 'hybrid')).toMatchObject({ mode: 'known', cantripsMax: 5, knownMax: 6, maxSpellLevel: 3 }); // no slots: its own "highest spell level"
    expect(make([{ id: 'class.warrior', level: 5 }]).sheet.spellbook.classes).toEqual([]);
  });

  it('a prepared class’s spell is ready only when prepared; a learned class’s is always ready; cantrips always', () => {
    const { sheet } = make([{ id: 'class.priest', level: 5 }, { id: 'class.oracle', level: 3 }], [
      { id: 'a', name: 'Bless', level: 1, list: 'spellList.priest' },
      { id: 'b', name: 'Cure Wounds', level: 1, list: 'spellList.priest', prepared: true },
      { id: 'c', name: 'Guidance', level: 0, list: 'spellList.priest' },
      { id: 'd', name: 'Detect Magic', level: 1, list: 'spellList.oracle' },
      { id: 'e', name: 'Augury', level: 2, list: 'spellList.oracle', prepared: true },
    ]);
    const of = (name: string) => sheet.spellbook.known.find((k) => k.name === name)!;
    expect(of('Bless')).toMatchObject({ cls: 'class.priest', clsName: 'Priest', mode: 'prepared', ready: false });
    expect(of('Cure Wounds')).toMatchObject({ mode: 'prepared', ready: true });
    expect(of('Guidance')).toMatchObject({ cls: 'class.priest', ready: true });
    expect(of('Detect Magic')).toMatchObject({ cls: 'class.oracle', mode: 'known', ready: true });
    expect(cls(sheet, 'priest')).toMatchObject({ cantrips: 1, known: 2, prepared: 1 });
    expect(cls(sheet, 'oracle')).toMatchObject({ cantrips: 0, known: 2 });
  });

  it('multiclass: each class keeps its own limits at its own level, while Priest and Tinkerer levels pool for slots', () => {
    const { sheet } = make([{ id: 'class.priest', level: 3 }, { id: 'class.tinkerer', level: 4 }], [
      { id: 'a', name: 'Bless', level: 1, list: 'spellList.priest', prepared: true },
      { id: 'b', name: 'Spirit Guardians', level: 3, list: 'spellList.priest', prepared: true },
      { id: 'c', name: 'Fireball', level: 3, list: 'spellList.tinkerer', prepared: true },
      { id: 'd', name: 'Shield', level: 1, cls: 'class.tinkerer' },
      { id: 'e', name: 'Homebrew', level: 2 },
    ]);
    // Priest 3: prepares Wis 3 + 3 = 6, up to 2nd level. Tinkerer 4: Int 3 + 4 = 7, up to 2nd level.
    expect(cls(sheet, 'priest')).toMatchObject({ level: 3, preparedMax: 6, maxSpellLevel: 2, known: 2, prepared: 2 });
    expect(cls(sheet, 'tinkerer')).toMatchObject({ level: 4, preparedMax: 7, maxSpellLevel: 2, known: 2, prepared: 1 });
    expect(cls(sheet, 'priest').dc!.value).toBe(8 + 3 + 3);
    // Slots are a 7th-level caster's (3 + 4), which reach 4th level: higher than either class can prepare.
    expect(sheet.spellbook.pooledSlots).toBe(true);
    expect(sheet.spellbook.slots.map((s) => [s.id, s.max])).toEqual([['slots1', 4], ['slots2', 3], ['slots3', 3], ['slots4', 1]]);
    const of = (name: string) => sheet.spellbook.known.find((k) => k.name === name)!;
    expect(of('Spirit Guardians')).toMatchObject({ cls: 'class.priest', tooHigh: true });
    expect(of('Bless')).toMatchObject({ tooHigh: false, castableWith: [1, 2, 3, 4] }); // a lower-level spell may use the higher slots
    expect(of('Shield')).toMatchObject({ cls: 'class.tinkerer', clsName: 'Tinkerer', ready: false });
    expect(of('Homebrew')).toMatchObject({ cls: undefined, mode: undefined, ready: true, tooHigh: false }); // two casting classes and no way to tell: left for the player to say
  });

  it('with one casting class every spell counts for it; a class that no longer casts lets go of its spells', () => {
    const one = make([{ id: 'class.oracle', level: 5 }, { id: 'class.warrior', level: 2 }], [{ id: 'a', name: 'Anything', level: 1 }, { id: 'b', name: 'Old', level: 1, cls: 'class.priest', prepared: true }]).sheet;
    expect(one.spellbook.known.map((k) => [k.name, k.cls, k.ready])).toEqual([['Anything', 'class.oracle', true], ['Old', 'class.oracle', true]]);
    expect(one.spellbook.pooledSlots).toBe(false);
    expect(normalizeDoc({ ...make([{ id: 'class.oracle', level: 5 }]).doc, spells: [{ id: 'a', name: 'X', level: 1, cls: 7 }, { id: 'b', name: 'Y', level: 1, cls: 'class.oracle' }] })!.spells!.map((s) => s.cls)).toEqual([undefined, 'class.oracle']);
  });
});

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('the class lists hold every name on their page (%s)', (version) => {
  const rules = loadRules(version);
  const size = (id: string) => Object.values((rules.get(id)?.levels ?? {}) as Record<string, string[]>).reduce((n, names) => n + names.length, 0);
  const at = (id: string, level: number) => ((rules.get(id)!.levels as Record<string, string[]>)[String(level)] ?? []);

  it('each list has as many spells as are printed, counted from the page', () => {
    // Counted independently from the PDF: every piece in the list's own type on the page, less a "(ritual)" or a name's second line.
    expect([size('spellList.chemist'), size('spellList.hybrid'), size('spellList.marksman'), size('spellList.oracle'), size('spellList.priest'), size('spellList.tinkerer')]).toEqual([103, 61, 54, 69, 89, 190]);
    expect(size(version === 'dndf-10' ? 'spellList.virtuoso' : 'spellList.skald')).toBe(110);
    if (version === 'dndf-8.8') expect(size('spellList.devilforged')).toBe(88);
  });

  it('the names at the top of each column are there, under the level the column continues', () => {
    // These sit beside the list's title, above where a column's first heading is; a height cut-off once dropped them.
    expect(at('spellList.priest', 0)).toEqual(expect.arrayContaining(['Guidance', 'Light', 'Mending']));
    expect(at('spellList.priest', 2)).toEqual(expect.arrayContaining(['Aid', 'Augury', 'Blindness/Deafness']));
    expect(at('spellList.priest', 3)).toEqual(expect.arrayContaining(['Glyph of Warding', 'Mass Healing Word']));
    expect(at('spellList.priest', 5)).toEqual(expect.arrayContaining(['Holy Weapon', 'Insect Plague', 'Mass Cure Wounds']));
    expect(at('spellList.oracle', 0)).toEqual(expect.arrayContaining(['Guidance', 'Light']));
    expect(at('spellList.oracle', 1)).toEqual(expect.arrayContaining(['Identify', 'Sanctuary', 'Shield of Faith']));
    expect(at('spellList.marksman', 1)).toEqual(expect.arrayContaining(['Longstrider', 'Searing Smite', 'Snare', 'Zephyr Strike']));
  });
});

describe('giving a class a spell that is not on its list (an override)', () => {
  const rules = loadRules('dndf-10');
  const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.priest', level: 5, scores }, rules);
  const known = (spells: KnownSpell[], classes = base.classes) => deriveSheet({ ...base, classes, spells }, rules).spellbook.known;

  it('is allowed, counts toward the class like any other, and is marked', () => {
    const list = known([
      { id: 'a', name: 'Bless', level: 1, list: 'spellList.priest' },
      { id: 'b', name: 'Fireball', level: 3, list: 'spellList.tinkerer', entry: 'spell.fireball', prepared: true },
      { id: 'c', name: 'Storm Lance', level: 2, own: { text: 'Mine.' } },
      { id: 'd', name: 'Feign Death', level: 3 },
    ]);
    const of = (name: string) => list.find((k) => k.name === name)!;
    expect(of('Bless')).toMatchObject({ cls: 'class.priest', override: false });
    expect(of('Fireball')).toMatchObject({ cls: 'class.priest', override: true, ready: true, mode: 'prepared' }); // a Tinkerer spell, prepared as a Priest
    expect(of('Storm Lance')).toMatchObject({ cls: 'class.priest', override: true }); // a spell of the player's own
    expect(of('Feign Death').override).toBe(false); // on the list as "Feign Death (ritual)"
    const sheet = deriveSheet({ ...base, spells: [{ id: 'b', name: 'Fireball', level: 3, list: 'spellList.tinkerer', prepared: true }] }, rules);
    expect(sheet.spellbook.classes[0]).toMatchObject({ known: 1, prepared: 1 });
  });

  it('follows the class the spell counts for, and a spell with no class is not marked', () => {
    const two = [...base.classes, { id: 'class.tinkerer', level: 3 }];
    const list = known([
      { id: 'a', name: 'Fireball', level: 3, list: 'spellList.tinkerer' },
      { id: 'b', name: 'Fireball', level: 3, list: 'spellList.tinkerer', cls: 'class.priest' },
      { id: 'c', name: 'Bless', level: 1, cls: 'class.tinkerer' },
      { id: 'd', name: 'Homebrew', level: 1 },
    ], two);
    expect(list.map((k) => [k.name, k.clsName, k.override])).toEqual([['Bless', 'Tinkerer', true], ['Homebrew', undefined, false], ['Fireball', 'Tinkerer', false], ['Fireball', 'Priest', true]]);
    // A class with no list of its own (none in this handbook) has nothing to override.
    expect(known([{ id: 'a', name: 'Anything', level: 1 }], [{ id: 'class.warrior', level: 5 }])[0]).toMatchObject({ cls: undefined, override: false });
  });
});
