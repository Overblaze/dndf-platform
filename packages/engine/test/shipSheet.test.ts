// The ship sheet (DM Guide chapter 2; docs/FORMULAS.md "Ships", whose sample is the Caravel).
import { describe, expect, it } from 'vitest';
import { damageComponent, deriveShip, newShip, normalizeShip, shipLog, upgradePrice, voyage, type RuleEntry, type ShipDoc } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
let n = 0;
const id = () => `id${++n}`;
const caravel = () => newShip(rules.get('shipType.caravel')!, 'Going Test', id);
const part = (doc: ShipDoc, name: string) => doc.components.find((c) => c.name === name)!;

describe('a ship from the book', () => {
  it('starts as its stat block: each cannon its own component, nothing damaged', () => {
    const doc = caravel();
    expect(doc).toMatchObject({ name: 'Going Test', type: 'shipType.caravel', typeName: 'Caravel', size: 'Gargantuan', cost: 50_000_000, upgradeSlots: 5, crewMax: 8, passengerMax: 10, cargoTons: 10, pace: { mph: 4, milesPerDay: 96 } });
    expect(doc.components.map((c) => [c.name, c.role, c.ac, c.maxHp, c.threshold ?? null, c.damage])).toEqual([
      ['Hull', 'hull', 15, 150, 10, 0], ['Control: Helm', 'control', 15, 50, null, 0], ['Movement: Sails', 'movement', 12, 100, null, 0], ['Weapon: Cannon 1', 'weapon', 15, 50, null, 0], ['Weapon: Cannon 2', 'weapon', 15, 50, null, 0],
    ]);
    const sheet = deriveShip({ ...doc, crew: 8 });
    expect(sheet.summary).toBe('Caravel · Gargantuan vehicle (70 ft. by 20 ft.)');
    expect(sheet.abilities.str).toEqual({ score: 18, mod: 4, autoFail: false });
    expect(sheet.abilities.int).toMatchObject({ score: 0, autoFail: true });
    expect(sheet.speed).toMatchObject({ value: 35, from: 'Movement: Sails' });
    expect(sheet.notes).toEqual([]);
    for (const type of [...rules.values()].filter((e) => e.kind === 'shipType')) {
      const made = deriveShip({ ...newShip(type, '', id), crew: Number(type.crew) });
      expect(made.name, type.name).toBe(type.name);
      expect(made.components.length, type.name).toBeGreaterThan(1);
      expect(made.speed.value, type.name).toBeGreaterThan(0);
      expect(made.notes, type.name).toEqual([]);
    }
  });

  it('damage under the hull’s threshold does nothing; at or over it, all of it counts', () => {
    const doc = caravel();
    const hull = part(doc, 'Hull').id;
    const glancing = damageComponent(doc, hull, 9);
    expect(glancing.doc).toBe(doc);
    expect(glancing.summary).toBe('Hull: 9 damage is under its threshold of 10, so none gets through');
    const hit = damageComponent(doc, hull, 12);
    expect(hit.summary).toBe('Hull takes 12: 150 → 138 hit points');
    expect(deriveShip(hit.doc).components[0]).toMatchObject({ hp: 138, destroyed: false });
    const sunk = damageComponent(hit.doc, hull, 999).doc;
    expect(deriveShip(sunk).components[0]).toMatchObject({ hp: 0, destroyed: true });
    expect(deriveShip(sunk).notes).toContain('Hull is at 0 hit points');
    const mended = damageComponent(sunk, hull, -40);
    expect(mended.summary).toBe('Hull repaired 40: 0 → 40 hit points');
    expect(damageComponent(mended.doc, hull, -999).doc.components[0]!.damage).toBe(0);
  });

  it('sails lose 5 ft for every full 25 damage; a destroyed helm or cannon is said', () => {
    const doc = { ...caravel(), crew: 8 };
    const sails = part(doc, 'Movement: Sails').id;
    expect(deriveShip(damageComponent(doc, sails, 24).doc).speed.value).toBe(35);
    const torn = deriveShip(damageComponent(doc, sails, 60).doc);
    expect(torn.speed.value).toBe(25);
    expect(torn.speed.lines).toEqual([{ label: 'Movement: Sails', value: 35 }, { label: 'Movement: Sails: 60 damage taken', value: -10 }]);
    expect(deriveShip(damageComponent(doc, sails, 100).doc).speed.value).toBe(0);
    const broken = deriveShip(damageComponent(damageComponent(doc, part(doc, 'Control: Helm').id, 50).doc, part(doc, 'Weapon: Cannon 1').id, 50).doc);
    expect(broken.notes).toEqual(['Control: Helm is destroyed: the ship can’t turn', 'Weapon: Cannon 1 is destroyed']);
    expect(broken.weapons).toEqual({ total: 2, working: 1, usable: 1 });
  });

  it('short-handed, cramped and overloaded are worked out and said, and each halves what the book says it halves', () => {
    const doc = caravel();
    const half = deriveShip({ ...doc, crew: 4 });
    expect(half.crew.shortHanded).toBe(true);
    expect(half.speed.value).toBe(17);
    expect(half.weapons.usable).toBe(1);
    expect(half.notes[0]).toBe('Short-handed (4 of 8 crew): half speed, and only 1 of 2 weapons can be used');
    expect(deriveShip({ ...doc, crew: 5 }).crew.shortHanded).toBe(false);
    expect(deriveShip({ ...doc, crew: 8, passengers: 11 })).toMatchObject({ crew: { cramped: true } });
    expect(deriveShip({ ...doc, crew: 8, passengers: 10 }).crew.cramped).toBe(false);
    const loaded = deriveShip({ ...doc, crew: 8, hold: [{ id: 'a', name: 'Cola', qty: 20, tons: 0.25 }, { id: 'b', name: 'Cannonballs', qty: 3, tons: 2 }, { id: 'c', name: 'Letters', qty: 100 }] });
    expect(loaded.cargo).toMatchObject({ tons: 11, capacity: 10, over: true });
    expect(loaded.speed.value).toBe(17);
    expect(loaded.notes).toEqual(['Over cargo capacity (11 of 10 tons): half speed, disadvantage on rolls to maneuver, and the ship may capsize']);
  });

  it('upgrades: slots used against the ship’s, and a price that is a flat part plus a share of the ship’s cost', () => {
    const doc = caravel();
    const price = (name: string) => upgradePrice(rules.get(`shipUpgrade.${name}`) as RuleEntry, doc.cost);
    expect(price('cannon_upgrade')).toBe(20_000_000);
    expect(price('paddle_wheel_upgrade')).toBe(10_000_000 + 10_000_000); // + 20% of ฿50M
    expect(price('helm_upgrade')).toBe(2_500_000); // 5% of ฿50M
    const fitted = deriveShip({ ...doc, upgrades: [{ id: 'a', name: 'Cannon Upgrade', slots: 1, how: 'bought' }, { id: 'b', name: 'Paddle-Wheel Upgrade', slots: 2, how: 'gift' }, { id: 'c', name: 'Figurehead', slots: 3, how: 'custom' }] });
    expect(fitted.slots).toEqual({ used: 6, total: 5, over: true });
    expect(fitted.notes).toContain('6 upgrade slots used of 5');
  });

  it('a voyage: days at the ship’s pace, and whether the rations last', () => {
    const doc = { ...caravel(), crew: 8, rations: 120 };
    expect(voyage(doc, 240)).toEqual({ days: 2.5, rationDays: 15, enough: true }); // 240 ÷ 96
    expect(voyage({ ...doc, rations: 16 }, 240)).toMatchObject({ rationDays: 2, enough: false });
    expect(voyage({ ...doc, crew: 0 }, 240)).toMatchObject({ rationDays: null, enough: null });
    expect(deriveShip(doc)).toMatchObject({ rationDays: 15, soul: { points: 0, dc: 15, sentient: false } });
    expect(deriveShip({ ...doc, soul: 3 }).soul.sentient).toBe(true);
  });

  it('the log keeps the newest hundred lines', () => {
    let doc = caravel();
    for (let i = 1; i <= 105; i++) doc = shipLog(doc, `line ${i}`, '2026-10-08');
    expect(doc.log).toHaveLength(100);
    expect(doc.log[0]).toEqual({ at: '2026-10-08', text: 'line 105' });
  });

  it('a damaged or hand-made save still opens, with every part the right kind of thing', () => {
    expect(normalizeShip(null)).toBeNull();
    expect(normalizeShip({ schema: 2 })).toBeNull();
    const odd = normalizeShip({ schema: 1, name: '  ', crewMax: -4, abilities: { str: 99, dex: 'x' }, pace: 'fast', components: [null, 7, { name: 'Hull', role: 'nonsense', maxHp: 'lots', damage: -5, speedLoss: { feet: 5, per: 0 } }, { id: 'a' }, { id: 'a' }], upgrades: [{ slots: 'two', how: 'stolen' }], hold: [{ qty: -3, tons: -1 }], treasury: 12.6, soul: 9, log: 'x', notes: 5 })!;
    expect(odd).toMatchObject({ name: 'Our ship', crewMax: 0, treasury: 13, soul: 3, notes: '', log: [], pace: { mph: 3 } });
    expect(odd.abilities).toEqual({ str: 30, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });
    expect(odd.components.map((c) => [c.role, c.maxHp, c.damage, c.speedLoss])).toEqual([['other', undefined, 0, undefined], ['other', undefined, 0, undefined], ['other', undefined, 0, undefined]]);
    expect(new Set(odd.components.map((c) => c.id)).size).toBe(3);
    expect(odd.upgrades[0]).toMatchObject({ slots: 0, how: 'bought' });
    expect(odd.hold[0]).toMatchObject({ qty: 0, tons: undefined });
    expect(() => deriveShip(odd)).not.toThrow();
    expect(deriveShip(newShip(null, '', id))).toMatchObject({ name: 'Our ship', speed: { value: 0, from: null }, components: [] });
    const round = normalizeShip(JSON.parse(JSON.stringify(caravel())))!;
    expect(normalizeShip(JSON.parse(JSON.stringify(round)))).toEqual(round);
  });
});
