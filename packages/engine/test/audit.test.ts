// What the Phase 3 audit found, kept fixed: text the PDF reader used to cut off or misplace, and
// shapes no book text should have. The full comparison with the PDFs is tools/extract/audit.py.
import { describe, expect, it } from 'vitest';
import type { RuleEntry, RulesVersion } from '../src';
import { loadRules } from './load';

const BOTH = ['dndf-10', 'dndf-8.8'] as RulesVersion[];
type Part = { name?: string; text?: string; sections?: Part[]; tables?: { rows: string[][] }[]; uses?: unknown };

function allText(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allText(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allText(v, out));
  return out;
}
const part = (rules: Map<string, RuleEntry>, id: string, name: string): Part =>
  ((rules.get(id)!.sections ?? rules.get(id)!.features ?? rules.get(id)!.options) as Part[]).find((p) => p.name === name)!;

describe.each(BOTH)('audit findings stay fixed (%s)', (version) => {
  const rules = loadRules(version);
  const entries = [...rules.values()];

  it('a paragraph that runs from one column to the next is whole: net, Ball Dial, Training Surges', () => {
    expect(part(rules, 'rule.armory_weapons', 'Special Weapons').text).toMatch(/Strength check, or by destroying the net/);
    expect(part(rules, 'rule.spirit_surge_training', 'Training Surges').text).toMatch(/an individual fee for each trainee\./);
    if (version === 'dndf-10') expect(part(rules, 'rule.armory_dials_dial_inventions', 'Ball Dial').text).toMatch(/of your choice at the start of your turn\./);
  });

  it('no compound is left split at a line break ("fruit- infused")', () => {
    const split = entries.flatMap((e) => allText(e).flatMap((t) => t.match(/\b[A-Za-z]+- [a-z]+\b/g) ?? []));
    expect(split).toEqual([]);
  });

  it('every chapter opening is kept, with the list of classes and subclasses on the class chapter', () => {
    const openings = entries.filter((e) => e.id.endsWith('_opening'));
    expect(openings.map((e) => e.name).sort()).toEqual([
      'Chapter 1: Making a Character', 'Chapter 2: Character Races', 'Chapter 3: Character Classes',
      'Chapter 4: Updated Spell Lists', 'Chapter 7: Expanded Armory', 'Underworld Marketplace',
    ]);
    for (const opening of openings) {
      expect(String(opening.text), opening.name).toMatch(/^[A-Z][a-z ]/); // the small-capital first line reads as a sentence
      expect(String(opening.text), opening.name).toMatch(/[.!?]$/);
    }
    const classes = openings.find((e) => e.name === 'Chapter 3: Character Classes')!;
    expect((classes.tables as { rows: string[][] }[]).reduce((n, t) => n + t.rows.length, 0)).toBeGreaterThan(80);
  });

  it('table rows keep their columns: a short row has blanks, it does not slide left', () => {
    const odd: string[] = [];
    const walk = (value: unknown, where: string): void => {
      if (Array.isArray(value)) return value.forEach((v) => walk(v, where));
      if (!value || typeof value !== 'object') return;
      const holder = value as Part;
      for (const table of holder.tables ?? []) {
        const widths = table.rows.map((r) => r.length);
        const usual = [...widths].sort((a, b) => widths.filter((w) => w === b).length - widths.filter((w) => w === a).length)[0]!;
        // captions and sub-headings are one cell; a stat block is single lines with one row of six abilities
        if (widths.some((w) => w !== usual && w !== 1 && !(usual === 1 && (w === 2 || w === 6)))) odd.push(`${where}: ${holder.name ?? ''}`);
      }
      Object.values(value).forEach((v) => walk(v, where));
    };
    for (const entry of entries) walk(entry, entry.name);
    expect(odd).toEqual(['Paramecia Rules: Paramecia Awakening']); // one row the book prints with an extra cell
  });

  it('the Steamtech device table is on Steamtech Devices and Overclock reads through', () => {
    const steam = rules.get('subclass.tinkerer.steamtech')!.features as Part[];
    expect(steam.find((f) => f.name === 'Steamtech Devices')!.tables![0]!.rows).toHaveLength(11);
    expect(steam.find((f) => f.name === 'Overclock')!.sections).toBeUndefined();
    expect(steam.find((f) => f.name === 'Overclock')!.text).toMatch(/third Steamtech Device\.$/);
  });

  it('Hybrid Heightened Power ends at its own sentence, without the fragment that ran off the page', () => {
    const enhancements = (rules.get('class.hybrid')!.features as Part[]).find((f) => f.name === 'Power Enhancements')!;
    expect(enhancements.sections!.find((s) => s.name === 'Heightened Power')!.text).toMatch(/saving throw against the spell\.$/);
  });
});

it('Logia Recharge (v8.8) has no use counter: its "once per long rest" describes other emanations', () => {
  const options = loadRules('dndf-8.8' as RulesVersion).get('optionGroup.devilforged_sea_devils_emanations')!.options as Part[];
  expect(options.find((o) => o.name === 'Logia Recharge')!.uses).toBeUndefined();
  expect(options.find((o) => o.name === 'Blast Shot')!.uses).toEqual({ max: 1, recharge: 'long' });
});
