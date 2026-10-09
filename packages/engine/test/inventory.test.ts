// What a character carries: weight against carrying capacity, and berries.
import { describe, expect, it } from 'vitest';
import { carriedWeight, deriveSheet, exactBerries, inventoryFromItem, newCharacter, normalizeDoc, parseWeight, type CharacterDoc } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const base = newCharacter({ name: 'T', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 3, scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }, rules);
const withGear = (more: Partial<CharacterDoc>) => deriveSheet({ ...base, ...more }, rules);

describe('inventory', () => {
  it('reads the armory’s weights as printed', () => {
    expect(['8 lb.', '1/4 lb.', '2.5 lb', '—', '', 12, -1].map(parseWeight)).toEqual([8, 0.25, 2.5, undefined, undefined, 12, undefined]);
    for (const item of [...rules.values()].filter((e) => e.kind === 'item')) {
      const made = inventoryFromItem(item, 'x');
      expect(made.name).toBe(item.name);
      expect(made.item).toBe(item.id);
      if (/\d/.test(String(item.weight))) expect(made.weight, item.name).toBeGreaterThan(0);
    }
  });

  it('adds up what is carried: count × weight, leaving out what is stowed or has no weight', () => {
    const { lines, carried } = carriedWeight([
      { id: 'a', name: 'Rope', qty: 2, weight: 10 },
      { id: 'b', name: 'Knuckles', qty: 3, weight: 0.25 },
      { id: 'c', name: 'Chest of plunder', qty: 1, weight: 300, carried: false },
      { id: 'd', name: 'Letter', qty: 1 },
    ], 150);
    expect(lines.map((l) => l.total)).toEqual([20, 0.75, 300, 0]);
    expect(carried).toBe(20.75);
  });

  it('carrying capacity is Strength × 15 lb; over it is said under "In effect" and nothing is stopped', () => {
    const light = withGear({ inventory: [{ id: 'a', name: 'Pack', qty: 1, weight: 150 }], money: 1250000 });
    expect(light.gear).toMatchObject({ carried: 150, capacity: 150, over: false });
    expect(light.money).toBe(1250000);
    expect(light.notes.some((n) => n.from === 'Gear')).toBe(false);
    const heavy = withGear({ inventory: [{ id: 'a', name: 'Pack', qty: 1, weight: 150.5 }] });
    expect(heavy.gear.over).toBe(true);
    expect(heavy.notes).toContainEqual({ label: 'Carrying 150.5 lb, more than your capacity of 150 lb', from: 'Gear' });
    expect(heavy.speed.value).toBe(light.speed.value);
    // The player's own capacity counts, and so does a stronger back.
    expect(withGear({ inventory: [{ id: 'a', name: 'Pack', qty: 1, weight: 200 }], overrides: { carry: 400 } }).gear.over).toBe(false);
    expect(withGear({ scores: { ...base.scores, str: 16 } }).gear.capacity).toBe(240);
  });

  it('berries are written with the sign and thousands', () => {
    expect([0, 5000, 1250000, 99.6].map(exactBerries)).toEqual(['฿0', '฿5,000', '฿1,250,000', '฿100']);
  });

  it('a damaged list still opens; an old save has no list at all', () => {
    const saved = normalizeDoc({ ...base, inventory: [null, 'x', { name: 'Rope', qty: 2.6, weight: 10 }, { id: 'k', qty: -4, weight: 'heavy' }], money: 'lots' })!;
    expect(saved.inventory).toEqual([{ id: 'item-1', name: 'Rope', qty: 3, weight: 10 }, { id: 'k', name: 'Item', qty: 0, weight: undefined }]);
    expect(saved.money).toBeUndefined();
    expect(normalizeDoc(base)!.inventory).toBeUndefined();
    expect(deriveSheet(normalizeDoc(base)!, rules)).toMatchObject({ money: 0, gear: { lines: [], carried: 0 } });
  });
});

describe('berries written out', () => {
  it('a debt has its sign before the berry mark', async () => {
    const { exactBerries, formatBerries } = await import('../src');
    expect(exactBerries(1_250_000)).toBe('฿1,250,000');
    expect(exactBerries(-750_000)).toBe('-฿750,000');
    expect(exactBerries(-0.4)).toBe('฿0');
    expect(formatBerries(-2_500_000)).toBe('-฿2.5M');
    expect(formatBerries(-40)).toBe('-฿40');
    expect(formatBerries(50_000_000)).toBe('฿50M');
  });
});
