import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ruleSet } from './rules';
import { buildLibrary, challengeOf, outlineOf, searchSrd, type SrdChapter, type SrdEntry } from './srd52';

const dir = join(import.meta.dirname, '..', '..', '..', 'data', 'reference', 'srd-5.2');
const library = buildLibrary(readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as SrdChapter));
const all = library.chapters.flatMap((chapter) => chapter.entries);
const ofKind = (kind: SrdEntry['kind']) => all.filter((entry) => entry.kind === kind);
const named = (name: string) => all.find((entry) => entry.name === name)!;

describe('the SRD 5.2.1 shelf', () => {
  it('holds the whole book in its own order', () => {
    expect(library.chapters.map((c) => c.chapter)).toEqual([
      'Playing the Game', 'Character Creation', 'Classes', 'Character Origins', 'Feats', 'Equipment', 'Spells',
      'Rules Glossary', 'Gameplay Toolbox', 'Magic Items', 'Monsters', 'Monsters A–Z', 'Animals',
    ]);
    expect(ofKind('class').map((c) => c.name)).toEqual(['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']);
    expect(ofKind('background').map((b) => b.name)).toEqual(['Acolyte', 'Criminal', 'Sage', 'Soldier']);
    expect(ofKind('species').map((s) => s.name)).toEqual(['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling']);
    expect(ofKind('feat')).toHaveLength(17);
    expect(ofKind('spell')).toHaveLength(339);
    expect(ofKind('term')).toHaveLength(155);
    expect(ofKind('magicItem')).toHaveLength(258);
    expect(ofKind('monster')).toHaveLength(330);
    expect(library.byId.size).toBe(all.length);
  });

  it('carries the attribution the licence asks for', () => {
    expect(library.note).toContain('System Reference Document 5.2.1');
    expect(library.note).toContain('Wizards of the Coast LLC');
    expect(library.note).toContain('https://creativecommons.org/licenses/by/4.0/legalcode');
  });

  it('gives every spell its line and its four facts', () => {
    for (const spell of ofKind('spell')) {
      expect(spell.subtitle, spell.name).toMatch(/^(Level \d \w+|\w+ Cantrip) \(/);
      const facts = spell.blocks[0];
      expect(facts?.t, spell.name).toBe('facts');
      if (facts?.t === 'facts') expect(facts.rows.map(([label]) => label.replace(/s$/, '')), spell.name).toEqual(['Casting Time', 'Range', 'Component', 'Duration']);
    }
    expect(named('Fireball').subtitle).toBe('Level 3 Evocation (Sorcerer, Wizard)');
  });

  it('names every spell on a class list, and lists no spell it does not have', () => {
    // Counted another way than the spell descriptions: the tables at the end of each spellcasting class.
    const listed = new Set<string>();
    for (const cls of ofKind('class')) {
      for (const block of cls.blocks) {
        if (block.t === 'table' && block.rows[0]?.[0] === 'Spell' && block.rows[0][1] === 'School') block.rows.slice(1).forEach((row) => listed.add(row[0] ?? ''));
      }
    }
    const spells = new Set(ofKind('spell').map((s) => s.name));
    expect([...listed].filter((name) => !spells.has(name))).toEqual([]);
    expect([...spells].filter((name) => !listed.has(name))).toEqual(['Phantasmal Force']); // described, but on no class's list in the document
  });

  it('gives every stat block six abilities, a challenge rating and its type', () => {
    for (const monster of ofKind('monster')) {
      const abilities = monster.blocks.filter((b) => b.t === 'abilities');
      expect(abilities, monster.name).toHaveLength(1);
      expect(monster.subtitle, monster.name).toMatch(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)/);
      expect(challengeOf(monster), monster.name).toMatch(/^(0|1\/8|1\/4|1\/2|\d+)$/);
    }
    for (const entry of all) {
      for (const block of entry.blocks) {
        if (block.t !== 'abilities') continue;
        expect(block.rows.map((row) => row[0]), entry.name).toEqual(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']);
        for (const [, score, mod] of block.rows) {
          // The modifier follows from the score, so a misread digit shows.
          expect(Number(mod.replace('−', '-')), `${entry.name} ${score}`).toBe(Math.floor((Number(score) - 10) / 2));
        }
      }
    }
    const goblin = named('Goblin Warrior');
    expect(goblin.group).toBe('Goblins');
    expect(challengeOf(goblin)).toBe('1/4');
  });

  it('reads wide tables as one table', () => {
    const table = (entry: string, title: string) => {
      const found = named(entry).blocks.find((b) => b.t === 'table' && b.title === title);
      if (found?.t !== 'table') throw new Error(`${entry} has no table called ${title}`);
      return found;
    };
    const barbarian = table('Barbarian', 'Barbarian Features');
    expect(barbarian.rows[0]).toEqual(['Level', 'Proficiency Bonus', 'Class Features', 'Rages', 'Rage Damage', 'Weapon Mastery']);
    expect(barbarian.rows).toHaveLength(21);
    expect(barbarian.rows[1]).toEqual(['1', '+2', 'Rage, Unarmored Defense, Weapon Mastery', '2', '+2', '2']);
    const wizard = table('Wizard', 'Wizard Features');
    expect(wizard.rows[0]?.slice(-9)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(wizard.over).toEqual([{ text: 'Spell Slots per Spell Level', from: 5, to: 13 }]);
    expect(wizard.rows[20]?.slice(-9)).toEqual(['4', '3', '3', '3', '3', '2', '2', '1', '1']);
    for (const cls of ofKind('class')) {
      // Levels 1 to 20, each once, in every class's table.
      expect(table(cls.name, `${cls.name} Features`).rows.slice(1).map((row) => row[0]), cls.name).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    }
    const weapons = table('Weapons', 'Weapons');
    expect(weapons.rows[0]).toEqual(['Name', 'Damage', 'Properties', 'Mastery', 'Weight', 'Cost']);
    expect(weapons.rows.find((row) => row[0] === 'Longsword')).toEqual(['Longsword', '1d8 Slashing', 'Versatile (1d10)', 'Sap', '3 lb.', '15 GP']);
  });

  it('keeps every table rectangular and every paragraph whole', () => {
    for (const entry of all) {
      for (const block of entry.blocks) {
        if (block.t === 'table') expect(new Set(block.rows.map((row) => row.length)).size, `${entry.name} p.${block.page}`).toBe(1);
        if (block.t === 'p' || block.t === 'stat') {
          expect(block.text, entry.name).not.toMatch(/^[a-z]/); // a paragraph cut in two would start in lower case
          if (block.lead) expect(block.text.startsWith(block.lead), entry.name).toBe(true);
        }
      }
    }
  });

  it('finds things by name, by a heading inside an entry, and by the words', () => {
    expect(searchSrd(library, 'f')).toEqual([]);
    expect(searchSrd(library, 'fireball')[0]).toMatchObject({ title: 'Fireball', page: named('Fireball').page });
    expect(searchSrd(library, 'grappled').map((hit) => hit.title)).toContain('Grappled [Condition]');
    // A name that starts with the words comes before one that only contains them.
    const fire = searchSrd(library, 'fire').map((hit) => hit.title);
    const firstOther = fire.findIndex((title) => !title.toLowerCase().startsWith('fire'));
    expect(fire.slice(0, firstOther)).toEqual(expect.arrayContaining(['Fire Bolt', 'Fire Shield', 'Fire Storm', 'Fireball']));
    expect(fire.slice(firstOther)).toEqual(expect.arrayContaining(['Wall of Fire', 'Faerie Fire']));
    expect(fire.slice(firstOther, fire.indexOf('Wall of Fire')).some((title) => title.toLowerCase().startsWith('fire'))).toBe(false);
    // A class feature is a heading inside the class.
    expect(searchSrd(library, 'extra attack').some((hit) => hit.where === 'Class · Fighter')).toBe(true);
    // The words: nothing is called this, but the text says it.
    expect(searchSrd(library, 'bright streak')).toEqual([]);
    const inside = searchSrd(library, 'bright streak', { words: true });
    expect(inside[0]).toMatchObject({ title: 'Fireball' });
    expect(inside[0]?.snippet).toContain('bright streak');
    expect(searchSrd(library, 'the', { words: true }).length).toBeLessThanOrEqual(60);
  });

  it('gives a class an outline to jump by', () => {
    const outline = outlineOf(named('Fighter'));
    expect(outline.map((item) => item.text)).toContain('Level 5: Extra Attack');
    expect(outline.every((item) => named('Fighter').blocks[item.index]?.t === 'h')).toBe(true);
  });

  it('is never part of a handbook: nothing here can be picked for a character', () => {
    for (const version of ['dndf-10', 'dndf-8.8'] as const) {
      const set = ruleSet(version);
      expect([...set.rules.keys()].filter((id) => id.startsWith('srd52.'))).toEqual([]);
      expect(set.classes.map((c) => c.name)).not.toContain('Warlock');
      expect([...set.rules.values()].some((entry) => entry.source.book === library.book)).toBe(false);
    }
    expect(all.every((entry) => entry.id.startsWith('srd52.'))).toBe(true);
  });
});
