// The bounty on the sheet: the DM Guide's suggestion (PDF p107), the player's own number, and the poster issued.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, cleanBounty, deriveSheet, formatBerries, newCharacter, normalizeDoc, type CharacterDoc, type RuleEntry } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 7, scores: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, rules);
const M = 1_000_000;

describe('bounty on the sheet', () => {
  it('starts from level squared and adds the deeds the player counts', () => {
    expect(deriveSheet(base, rules).wanted).toMatchObject({ value: 49 * M, calculated: 49 * M, overridden: false, page: 107, book: 'DnDF DM Guide' });
    const sheet = deriveSheet({ ...base, bounty: { deeds: { crewmates: 8, minorDeeds: 2, majorDeeds: 1, plunder: 250_000, civiliansHarmed: 3 } } }, rules);
    expect(sheet.wanted.value).toBe(49 * M + 8 * M + 20 * M + 100 * M + 500_000 + 300_000);
    expect(sheet.wanted.lines.map((l) => l.label)).toEqual(['Level 7 squared × ฿1M', 'Crewmates 8 × ฿1M', 'Minor deeds 2 × ฿10M', 'Major deeds 1 × ฿100M', 'Plunder × 2', 'Civilians 3 × ฿100K']);
  });

  it('reads the strongest Haki from the sheet, and a held Devil Fruit when the private content is there', () => {
    const haki: CharacterDoc = { ...base, surges: [{ id: 'a', entry: 'hakiFeature.aura_of_life' }, { id: 'b', entry: 'hakiFeature.spirit_emission' }, { id: 'c', entry: 'surgeAdvancement.quick_learner' }] };
    expect(deriveSheet(haki, rules).wanted.value).toBe(49 * M + 30 * M); // Very Rare is 3; a Legendary standard advancement is not Haki
    const fruit = { id: 'devilFruit.x', kind: 'devilFruit', name: 'X', versions: [], source: { book: 'T', page: 1 }, rarity: 'Legendary', type: 'Paramecia', features: [] } as unknown as RuleEntry;
    const held = deriveSheet(haki, rules, DEFAULT_SETTINGS, { granted: [{ key: 'k', kind: 'owner', revealed: false, entry: fruit }], advancements: [] });
    expect(held.wanted.value).toBe(49 * M + 30 * M + 40 * M);
    expect(held.wanted.lines.map((l) => l.label)).toContain('Devil Fruit rarity 4 × ฿10M');
    // Without the private content the fruit is not counted, so a public sheet says nothing about it.
    expect(deriveSheet(haki, rules).wanted.lines.some((l) => /Devil Fruit/.test(l.label))).toBe(false);
  });

  it('the player’s own number wins, and the calculated one stays', () => {
    const sheet = deriveSheet({ ...base, overrides: { bounty: 320 * M } }, rules);
    expect(sheet.wanted).toMatchObject({ value: 320 * M, calculated: 49 * M, overridden: true });
    expect(formatBerries(sheet.wanted.value)).toBe('฿320M');
  });

  it('a poster is what was issued, and stays that until a new one is', () => {
    const doc: CharacterDoc = { ...base, bounty: { epithet: 'Iron Fist', terms: 'Only Alive', deeds: { majorDeeds: 2 }, posted: { value: 60 * M, epithet: 'The Rookie', terms: 'Dead or Alive', at: '2026-10-01' } } };
    const sheet = deriveSheet(doc, rules);
    expect(sheet.wanted.value).toBe(249 * M);
    expect(sheet.poster).toEqual({ value: 60 * M, epithet: 'The Rookie', terms: 'Dead or Alive', at: '2026-10-01' });
    expect(deriveSheet(base, rules).poster).toBeNull();
  });

  it('a saved record is tidied, and a damaged one still opens', () => {
    expect(cleanBounty({ deeds: { crewmates: 3.6, minorDeeds: -2, plunder: 'lots', nonsense: 9 }, epithet: '  Red  ', terms: 'Whenever', posted: { value: 5e6, epithet: 7, terms: 'Only Dead', at: '2026-10-08T12:00' } }))
      .toEqual({ deeds: { crewmates: 4 }, epithet: 'Red', posted: { value: 5e6, epithet: undefined, terms: 'Only Dead', at: '2026-10-08' } });
    expect(cleanBounty({ posted: { value: 'x' } })).toBeUndefined();
    expect(cleanBounty('nope')).toBeUndefined();
    expect(normalizeDoc(base)!.bounty).toBeUndefined();
    expect(() => deriveSheet({ ...base, bounty: { deeds: 'x' as never, posted: null as never } }, rules)).not.toThrow();
  });
});
