// A thousand ships nobody would build: whatever is saved, the sheet opens, every number is a number,
// and saving twice changes nothing. Checks are worked out a second way here, not read back from the sheet's own sums.
import { describe, expect, it } from 'vitest';
import { SHIP_ABILITIES, UPGRADE_SOURCES, damageComponent, deriveShip, newShip, normalizeShip, shipLog, voyage, type ShipDoc } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const types = [...rules.values()].filter((e) => e.kind === 'shipType');
const upgrades = [...rules.values()].filter((e) => e.kind === 'shipUpgrade');
const rule = (key: string) => rules.get(key);

/** A small seeded generator, so a failure can be run again. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const JUNK: unknown[] = [undefined, null, NaN, Infinity, -Infinity, -1, 0, 1.5, 1e15, '', 'x', '12', true, [], {}, { a: 1 }, [null], () => 1];

function finite(value: unknown, path: string): void {
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`${path} is ${value}`); return; }
  if (Array.isArray(value)) { value.forEach((v, i) => finite(v, `${path}[${i}]`)); return; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) finite(v, `${path}.${k}`);
}

describe('ships under stress', () => {
  it('1,000 random ships: built, changed, damaged, saved and reopened', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const r = rng(seed);
      const int = (max: number) => Math.floor(r() * (max + 1));
      const pick = <T,>(list: readonly T[]) => list[int(list.length - 1)]!;
      let n = 0;
      const id = () => `s${seed}-${++n}`;
      let doc: ShipDoc = newShip(r() < 0.9 ? pick(types) : null, r() < 0.5 ? `Ship ${seed}` : '', id);

      // Make her the crew's own.
      doc = { ...doc, cost: int(200) * 1_000_000, worth: r() < 0.3 ? int(500) * 1_000_000 : undefined, typeName: r() < 0.3 ? 'Modified' : doc.typeName, upgradeSlots: int(8), crewMax: int(40), passengerMax: int(40), cargoTons: int(200) / 2, crew: int(60), passengers: int(60), rations: int(900), treasury: int(2000) * 100_000 - 50_000_000, soul: int(3) };
      for (let i = int(7); i > 0; i--) {
        const entry = r() < 0.7 ? pick(upgrades) : null;
        doc = { ...doc, upgrades: [...doc.upgrades, { id: id(), entry: entry?.id, name: entry?.name ?? `Own ${i}`, slots: entry ? Number(entry.slots) || 0 : int(3), how: pick(Object.keys(UPGRADE_SOURCES) as (keyof typeof UPGRADE_SOURCES)[]), paid: r() < 0.4 ? int(30) * 1_000_000 : undefined, worth: r() < 0.3 ? int(30) * 1_000_000 : undefined }] };
      }
      for (let i = int(5); i > 0; i--) doc = { ...doc, hold: [...doc.hold, { id: id(), name: `Cargo ${i}`, qty: int(20), tons: r() < 0.8 ? int(40) / 4 : undefined }] };
      if (r() < 0.3) doc = { ...doc, components: [...doc.components, { id: id(), name: 'Own engine', role: 'movement', maxHp: int(80), speed: int(90), damage: 0 }] };

      // Shoot at her and patch her up.
      for (let i = int(25); i > 0 && doc.components.length; i--) {
        const part = pick(doc.components);
        const amount = int(120) - 40;
        const before = part.damage;
        const result = damageComponent(doc, part.id, amount);
        const after = result.doc.components.find((c) => c.id === part.id)!.damage;
        expect(after, `seed ${seed}`).toBeGreaterThanOrEqual(0);
        if (part.maxHp !== undefined) expect(after, `seed ${seed}`).toBeLessThanOrEqual(Math.max(before, part.maxHp));
        if (amount > 0 && amount < (part.threshold ?? 0)) expect(after, `seed ${seed} under threshold`).toBe(before);
        if (amount > 0 && amount >= (part.threshold ?? 0) && part.maxHp === undefined) expect(after, `seed ${seed} over threshold`).toBe(before + amount);
        if (amount < 0) expect(after, `seed ${seed} repair`).toBe(Math.max(0, before + amount));
        expect(result.summary, `seed ${seed}`).not.toMatch(/NaN|undefined|Infinity/);
        doc = result.doc;
        if (r() < 0.2) doc = shipLog(doc, result.summary, '2026-10-08');
      }

      const sheet = deriveShip(doc, rule);
      finite(sheet, `seed ${seed} sheet`);
      expect(JSON.stringify(sheet), `seed ${seed}`).not.toMatch(/NaN|undefined/);
      for (const a of SHIP_ABILITIES) expect(sheet.abilities[a].mod, `seed ${seed}`).toBe(Math.floor((doc.abilities[a] - 10) / 2));

      // Counted a second way.
      let slots = 0; for (const u of doc.upgrades) slots += u.slots;
      expect(sheet.slots.used, `seed ${seed}`).toBe(slots);
      expect(sheet.slots.over, `seed ${seed}`).toBe(slots > doc.upgradeSlots);
      let tons = 0; for (const h of doc.hold) tons += h.qty * (h.tons ?? 0);
      expect(sheet.cargo.tons, `seed ${seed}`).toBeCloseTo(tons, 6);
      let worth = doc.cost;
      for (const u of doc.upgrades) {
        const book = u.entry ? rules.get(u.entry)! : null;
        worth += u.worth ?? u.paid ?? (book ? (typeof book.cost === 'number' ? book.cost : 0) + (typeof book.costPercent === 'number' ? Math.round(doc.cost * book.costPercent / 100) : 0) : 0);
      }
      expect(sheet.worth.calculated, `seed ${seed}`).toBe(worth);
      expect(sheet.worth.value, `seed ${seed}`).toBe(doc.worth ?? worth);
      expect(sheet.worth.value, `seed ${seed}`).toBeGreaterThanOrEqual(0);

      // Speed never goes below nothing or above her best mover, and each halving is real.
      const movers = sheet.components.filter((c) => c.role === 'movement' && c.speed !== undefined);
      const top = Math.max(0, ...movers.map((c) => c.speed!));
      expect(sheet.speed.value, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(sheet.speed.value, `seed ${seed}`).toBeLessThanOrEqual(top);
      expect(sheet.speed.lines.reduce((sum, l) => sum + l.value, 0), `seed ${seed} speed lines`).toBe(sheet.speed.value);
      const bestNow = Math.max(0, ...movers.map((c) => c.speedNow!));
      let expected = bestNow;
      if (sheet.crew.shortHanded) expected = Math.floor(expected / 2);
      if (sheet.cargo.over) expected = Math.floor(expected / 2);
      expect(sheet.speed.value, `seed ${seed} speed`).toBe(expected);
      for (const c of sheet.components) {
        if (c.hp !== null) { expect(c.hp, `seed ${seed}`).toBeGreaterThanOrEqual(0); expect(c.hp, `seed ${seed}`).toBeLessThanOrEqual(c.maxHp!); }
        if (c.destroyed) expect(sheet.notes.some((note) => note.startsWith(c.name)), `seed ${seed} destroyed is said`).toBe(true);
      }
      expect(sheet.weapons.usable, `seed ${seed}`).toBeLessThanOrEqual(sheet.weapons.working);
      expect(sheet.weapons.working, `seed ${seed}`).toBeLessThanOrEqual(sheet.weapons.total);

      const trip = voyage(doc, int(3000));
      expect(Number.isNaN(trip.days), `seed ${seed}`).toBe(false);
      expect(trip.days, `seed ${seed}`).toBeGreaterThanOrEqual(0);

      // Saved and opened again, she is the same ship; and again.
      const saved = normalizeShip(JSON.parse(JSON.stringify(doc)))!;
      expect(saved, `seed ${seed}`).toEqual(JSON.parse(JSON.stringify(normalizeShip(doc))));
      expect(normalizeShip(JSON.parse(JSON.stringify(saved))), `seed ${seed}`).toEqual(saved);
      expect(JSON.parse(JSON.stringify(deriveShip(saved, rule))), `seed ${seed}`).toEqual(JSON.parse(JSON.stringify(sheet)));
    }
  });

  it('500 broken saves: junk in any field never stops the sheet opening', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed * 7919);
      const int = (max: number) => Math.floor(r() * (max + 1));
      const junk = () => JUNK[int(JUNK.length - 1)];
      let n = 0;
      const raw = JSON.parse(JSON.stringify(newShip(types[int(types.length - 1)]!, 'Wreck', () => `w${++n}`))) as Record<string, unknown>;
      raw.upgrades = [{ id: 'u1', name: 'A', slots: 1, how: 'plunder', paid: 5, worth: 6 }, { id: 'u1', name: 'B', slots: 2, how: 'gift' }];
      raw.hold = [{ id: 'h1', name: 'Cola', qty: 3, tons: 0.5 }];
      raw.log = [{ at: '2026-10-08', text: 'x' }];
      for (let i = 1 + int(5); i > 0; i--) {
        const keys = Object.keys(raw).filter((k) => k !== 'schema');
        const key = keys[int(keys.length - 1)]!;
        const value = raw[key];
        if (Array.isArray(value) && value.length && r() < 0.6) {
          const item = value[int(value.length - 1)] as Record<string, unknown> | null;
          const inner = item && typeof item === 'object' ? Object.keys(item) : [];
          if (inner.length) item![inner[int(inner.length - 1)]!] = junk();
          if (r() < 0.2) value.push(junk());
        } else if (value && typeof value === 'object' && !Array.isArray(value) && r() < 0.6) {
          const inner = Object.keys(value);
          (value as Record<string, unknown>)[inner[int(inner.length - 1)]!] = junk();
        } else raw[key] = junk();
      }
      const doc = normalizeShip(raw);
      expect(doc, `seed ${seed}`).not.toBeNull();
      finite(doc, `seed ${seed} doc`);
      const sheet = deriveShip(doc!, rule);
      finite(sheet, `seed ${seed} sheet`);
      const ids = [...doc!.components, ...doc!.upgrades, ...doc!.hold].map((x) => x.id);
      expect(new Set(ids).size, `seed ${seed} ids`).toBe(ids.length);
      for (const c of doc!.components) expect(() => damageComponent(doc!, c.id, 30), `seed ${seed}`).not.toThrow();
      expect(normalizeShip(JSON.parse(JSON.stringify(doc))), `seed ${seed}`).toEqual(JSON.parse(JSON.stringify(doc)));
    }
  });
});
