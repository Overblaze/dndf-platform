// A crew's ship: what is saved about it, and every number on its sheet worked out from that
// (DM Guide chapter 2, PDF pages 11–43; docs/FORMULAS.md, "Ships"). Everything can be typed over,
// and going past a limit is said, never blocked.
import { abilityMod } from './core';
import { componentDamage, isCramped, isOverCargo, shipSoulDc, shortHanded, travelDays, type ShipSize } from './ships';
import type { RuleEntry } from './types';

export type ShipRole = 'hull' | 'control' | 'movement' | 'weapon' | 'other';
export const SHIP_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type ShipAbility = (typeof SHIP_ABILITIES)[number];

export interface ShipComponent {
  id: string;
  name: string;
  role: ShipRole;
  ac?: number;
  maxHp?: number;
  /** Damage below this is ignored. */
  threshold?: number;
  /** Feet of speed this gives, for a movement component. */
  speed?: number;
  /** Speed lost as the component is damaged: `feet` for every full `per` damage taken. */
  speedLoss?: { feet: number; per: number };
  /** The book's lines for it, or the player's. */
  text?: string;
  /** Damage it has taken. */
  damage: number;
}

export interface ShipUpgrade {
  id: string;
  /** The upgrade's entry in the rules data, when it is one from the book. */
  entry?: string;
  name: string;
  slots: number;
  /** How the crew came by it. */
  how: 'bought' | 'gift' | 'custom';
  /** What was paid, in berries. */
  paid?: number;
  note?: string;
}

export interface HoldItem { id: string; name: string; qty: number; /** Weight of one, in tons. */ tons?: number; notes?: string }
export interface ShipLogLine { at: string; text: string }

export interface ShipDoc {
  schema: 1;
  name: string;
  /** The ship type it was started from. */
  type?: string;
  typeName?: string;
  size: string;
  dimensions?: string;
  /** What the ship itself cost, which upgrade prices are a share of. */
  cost: number;
  upgradeSlots: number;
  crewMax: number;
  passengerMax: number;
  cargoTons: number;
  pace: { mph: number; milesPerDay?: number };
  abilities: Record<ShipAbility, number>;
  components: ShipComponent[];
  upgrades: ShipUpgrade[];
  /** People working the ship, and people only riding along. */
  crew: number;
  passengers: number;
  hold: HoldItem[];
  /** The crew's shared berries. */
  treasury: number;
  rations: number;
  /** Successful voyages toward a soul: 3 and the ship is sentient. */
  soul: number;
  notes: string;
  /** What changed in the hold and the treasury, newest first. */
  log: ShipLogLine[];
}

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const count = (value: unknown, fallback = 0) => Math.max(0, Math.round(num(value, fallback)));
const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const ROLES: ShipRole[] = ['hull', 'control', 'movement', 'weapon', 'other'];
export const SHIP_LOG_LINES = 100;

/** A ship as the book's stat block has it, ready to sail: every cannon its own component, nothing damaged. */
export function newShip(type: RuleEntry | null, name: string, makeId: () => string): ShipDoc {
  const components: ShipComponent[] = [];
  for (const c of ((type?.components ?? []) as Record<string, unknown>[])) {
    const copies = Math.max(1, count(c.count, 1));
    const base = String(c.name ?? 'Component').replace(/ \(\d+\)$/, '');
    for (let i = 1; i <= copies; i++) {
      components.push({
        id: makeId(), name: copies > 1 ? `${base} ${i}` : base, role: ROLES.includes(c.role as ShipRole) ? (c.role as ShipRole) : 'other',
        ac: typeof c.ac === 'number' ? c.ac : undefined, maxHp: typeof c.hp === 'number' ? c.hp : undefined, threshold: typeof c.threshold === 'number' ? c.threshold : undefined,
        speed: typeof c.speed === 'number' ? c.speed : undefined, speedLoss: c.speedLoss as ShipComponent['speedLoss'], text: text(c.text, 4000), damage: 0,
      });
    }
  }
  const abilities = (type?.abilities ?? {}) as Partial<Record<ShipAbility, number>>;
  const pace = (type?.pace ?? {}) as { mph?: number; milesPerDay?: number };
  return normalizeShip({
    schema: 1, name: name.trim() || type?.name || 'Our ship', type: type?.id, typeName: type?.name, size: String(type?.size ?? 'Gargantuan'), dimensions: typeof type?.dimensions === 'string' ? type.dimensions : undefined,
    cost: num(type?.cost, 0), upgradeSlots: num(type?.upgradeSlots, 0), crewMax: num(type?.crew, 1), passengerMax: num(type?.passengers, 0), cargoTons: num(type?.cargoTons, 0),
    pace: { mph: num(pace.mph, 3), milesPerDay: pace.milesPerDay },
    abilities: { str: num(abilities.str, 10), dex: num(abilities.dex, 10), con: num(abilities.con, 10), int: num(abilities.int, 0), wis: num(abilities.wis, 0), cha: num(abilities.cha, 0) },
    components, upgrades: [], crew: 0, passengers: 0, hold: [], treasury: 0, rations: 0, soul: 0, notes: '', log: [],
  })!;
}

/** Fills in anything missing from a saved ship and puts every part in shape, so an old or damaged save still opens. Null if it isn't one. */
export function normalizeShip(raw: unknown): ShipDoc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schema !== 1) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)) : []);
  const seen = new Set<string>();
  const id = (value: unknown, prefix: string, i: number) => {
    let made = typeof value === 'string' && value ? value : `${prefix}-${i + 1}`;
    while (seen.has(made)) made = `${made}-${i + 1}`;
    seen.add(made);
    return made;
  };
  const abilities = (r.abilities && typeof r.abilities === 'object' ? r.abilities : {}) as Record<string, unknown>;
  const pace = (r.pace && typeof r.pace === 'object' ? r.pace : {}) as Record<string, unknown>;
  return {
    schema: 1,
    name: text(r.name, 80).trim() || 'Our ship',
    type: typeof r.type === 'string' ? r.type : undefined,
    typeName: typeof r.typeName === 'string' ? r.typeName : undefined,
    size: text(r.size, 20) || 'Gargantuan',
    dimensions: typeof r.dimensions === 'string' ? r.dimensions.slice(0, 60) : undefined,
    cost: Math.max(0, num(r.cost, 0)),
    upgradeSlots: count(r.upgradeSlots),
    crewMax: count(r.crewMax, 1),
    passengerMax: count(r.passengerMax),
    cargoTons: Math.max(0, num(r.cargoTons, 0)),
    pace: { mph: Math.max(0, num(pace.mph, 3)), milesPerDay: typeof pace.milesPerDay === 'number' && Number.isFinite(pace.milesPerDay) ? Math.max(0, pace.milesPerDay) : undefined },
    abilities: Object.fromEntries(SHIP_ABILITIES.map((a) => [a, Math.min(30, count(abilities[a], 0))])) as Record<ShipAbility, number>,
    components: list(r.components).map((c, i) => ({
      id: id(c.id, 'part', i), name: text(c.name, 80) || 'Component', role: ROLES.includes(c.role as ShipRole) ? (c.role as ShipRole) : 'other',
      ac: typeof c.ac === 'number' && Number.isFinite(c.ac) ? Math.round(c.ac) : undefined,
      maxHp: typeof c.maxHp === 'number' && Number.isFinite(c.maxHp) ? Math.max(0, Math.round(c.maxHp)) : undefined,
      threshold: typeof c.threshold === 'number' && Number.isFinite(c.threshold) ? Math.max(0, Math.round(c.threshold)) : undefined,
      speed: typeof c.speed === 'number' && Number.isFinite(c.speed) ? Math.max(0, Math.round(c.speed)) : undefined,
      speedLoss: c.speedLoss && typeof c.speedLoss === 'object' && count((c.speedLoss as Record<string, unknown>).per) > 0
        ? { feet: count((c.speedLoss as Record<string, unknown>).feet), per: count((c.speedLoss as Record<string, unknown>).per) } : undefined,
      text: typeof c.text === 'string' ? c.text.slice(0, 4000) : undefined,
      damage: count(c.damage),
    })),
    upgrades: list(r.upgrades).map((u, i) => ({
      id: id(u.id, 'upgrade', i), entry: typeof u.entry === 'string' ? u.entry : undefined, name: text(u.name, 80) || 'Upgrade', slots: count(u.slots),
      how: u.how === 'gift' || u.how === 'custom' ? u.how : 'bought', paid: typeof u.paid === 'number' && Number.isFinite(u.paid) ? Math.max(0, Math.round(u.paid)) : undefined,
      note: typeof u.note === 'string' && u.note ? u.note.slice(0, 200) : undefined,
    })),
    crew: count(r.crew),
    passengers: count(r.passengers),
    hold: list(r.hold).map((h, i) => ({
      id: id(h.id, 'cargo', i), name: text(h.name, 80) || 'Cargo', qty: count(h.qty, 1),
      tons: typeof h.tons === 'number' && Number.isFinite(h.tons) && h.tons >= 0 ? h.tons : undefined, notes: typeof h.notes === 'string' && h.notes ? h.notes.slice(0, 300) : undefined,
    })),
    treasury: Math.round(num(r.treasury, 0)),
    rations: count(r.rations),
    soul: Math.min(3, count(r.soul)),
    notes: text(r.notes, 20000),
    log: list(r.log).filter((l) => typeof l.text === 'string').slice(0, SHIP_LOG_LINES).map((l) => ({ at: text(l.at, 30), text: text(l.text, 300) })),
  };
}

export interface SheetShipComponent extends ShipComponent { hp: number | null; destroyed: boolean; speedNow?: number }

export interface ShipSheet {
  name: string;
  /** "Caravel · Gargantuan vehicle (70 ft. by 20 ft.)" */
  summary: string;
  abilities: Record<ShipAbility, { score: number; mod: number; autoFail: boolean }>;
  components: SheetShipComponent[];
  /** The fastest working movement component, after its damage, short-handedness and overloading. */
  speed: { value: number; lines: { label: string; value: number }[]; from: string | null };
  crew: { aboard: number; max: number; passengers: number; passengerMax: number; shortHanded: boolean; cramped: boolean };
  weapons: { total: number; working: number; usable: number };
  cargo: { tons: number; capacity: number; over: boolean; lines: (HoldItem & { total: number })[] };
  slots: { used: number; total: number; over: boolean };
  treasury: number;
  /** Days the rations last for everyone aboard; null with nobody aboard. */
  rationDays: number | null;
  soul: { points: number; dc: number; sentient: boolean };
  /** What is wrong right now, in the book's terms. Nothing here stops anything. */
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function deriveShip(doc: ShipDoc): ShipSheet {
  const notes: string[] = [];
  const abilities = Object.fromEntries(SHIP_ABILITIES.map((a) => [a, { score: doc.abilities[a], mod: abilityMod(doc.abilities[a]), autoFail: doc.abilities[a] === 0 }])) as ShipSheet['abilities'];
  const components: SheetShipComponent[] = doc.components.map((c) => {
    const hp = c.maxHp === undefined ? null : Math.max(0, c.maxHp - c.damage);
    const destroyed = hp !== null && c.maxHp! > 0 && hp === 0;
    const lost = c.speedLoss && c.speedLoss.per > 0 ? c.speedLoss.feet * Math.floor(c.damage / c.speedLoss.per) : 0;
    return { ...c, hp, destroyed, speedNow: c.speed === undefined ? undefined : destroyed ? 0 : Math.max(0, c.speed - lost) };
  });
  for (const c of components) if (c.destroyed) notes.push(c.role === 'control' ? `${c.name} is destroyed: the ship can’t turn` : c.role === 'hull' ? `${c.name} is at 0 hit points` : `${c.name} is destroyed`);

  const weapons = components.filter((c) => c.role === 'weapon');
  const working = weapons.filter((c) => !c.destroyed).length;
  const short = shortHanded(doc.crew, doc.crewMax, 0, working);
  const cramped = isCramped(doc.crew + doc.passengers, doc.crewMax, doc.passengerMax);
  if (short.shortHanded) notes.push(`Short-handed (${doc.crew} of ${doc.crewMax} crew): half speed, and only ${short.usableWeapons} of ${working} weapon${working === 1 ? '' : 's'} can be used`);
  if (cramped) notes.push(`Cramped (${doc.crew + doc.passengers} aboard, room for ${doc.crewMax + doc.passengerMax}): all movement on the ship is halved`);

  const lines = doc.hold.map((h) => ({ ...h, total: round2(h.qty * (h.tons ?? 0)) }));
  const tons = round2(lines.reduce((sum, l) => sum + l.total, 0));
  const over = isOverCargo(tons, doc.cargoTons);
  if (over) notes.push(`Over cargo capacity (${tons} of ${doc.cargoTons} tons): half speed, disadvantage on rolls to maneuver, and the ship may capsize`);

  // Speed: the best movement component that still works, then what halves it.
  const movers = components.filter((c) => c.role === 'movement' && c.speedNow !== undefined);
  const best = movers.reduce<SheetShipComponent | null>((top, c) => (!top || c.speedNow! > top.speedNow! ? c : top), null);
  const speedLines: ShipSheet['speed']['lines'] = [];
  let speed = 0;
  if (best) {
    speedLines.push({ label: best.name, value: best.speed! });
    if (best.speedNow! < best.speed!) speedLines.push({ label: best.destroyed ? `${best.name} destroyed` : `${best.name}: ${best.damage} damage taken`, value: best.speedNow! - best.speed! });
    speed = best.speedNow!;
    if (short.shortHanded && speed > 0) { const half = Math.floor(speed / 2); speedLines.push({ label: 'Short-handed: half speed', value: half - speed }); speed = half; }
    if (over && speed > 0) { const half = Math.floor(speed / 2); speedLines.push({ label: 'Over cargo capacity: half speed', value: half - speed }); speed = half; }
  }

  const used = doc.upgrades.reduce((sum, u) => sum + u.slots, 0);
  if (used > doc.upgradeSlots) notes.push(`${used} upgrade slots used of ${doc.upgradeSlots}`);
  const aboard = doc.crew + doc.passengers;
  const size = (['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].includes(doc.size) ? doc.size : 'Gargantuan') as ShipSize;
  return {
    name: doc.name,
    summary: [doc.typeName, `${doc.size} vehicle${doc.dimensions ? ` (${doc.dimensions})` : ''}`].filter(Boolean).join(' · '),
    abilities, components,
    speed: { value: speed, lines: speedLines, from: best?.name ?? null },
    crew: { aboard: doc.crew, max: doc.crewMax, passengers: doc.passengers, passengerMax: doc.passengerMax, shortHanded: short.shortHanded, cramped },
    weapons: { total: weapons.length, working, usable: short.usableWeapons },
    cargo: { tons, capacity: doc.cargoTons, over, lines },
    slots: { used, total: doc.upgradeSlots, over: used > doc.upgradeSlots },
    treasury: doc.treasury,
    rationDays: aboard > 0 ? round2(doc.rations / aboard) : null,
    soul: { points: doc.soul, dc: shipSoulDc(size), sentient: doc.soul >= 3 },
    notes,
  };
}

/** Damage to one component: below its damage threshold nothing gets through. A negative amount repairs. */
export function damageComponent(doc: ShipDoc, id: string, amount: number): { doc: ShipDoc; summary: string } {
  const part = doc.components.find((c) => c.id === id);
  if (!part) return { doc, summary: '' };
  const max = part.maxHp ?? Infinity;
  if (amount < 0) {
    const damage = Math.max(0, part.damage + Math.round(amount));
    return { doc: { ...doc, components: doc.components.map((c) => (c.id === id ? { ...c, damage } : c)) }, summary: `${part.name} repaired ${part.damage - damage}: ${Number.isFinite(max) ? `${max - part.damage} → ${max - damage} hit points` : 'damage cleared'}` };
  }
  const through = componentDamage(Math.round(amount), part.threshold ?? 0);
  if (through === 0) return { doc, summary: `${part.name}: ${Math.round(amount)} damage is under its threshold of ${part.threshold}, so none gets through` };
  const damage = Math.min(max, part.damage + through);
  return { doc: { ...doc, components: doc.components.map((c) => (c.id === id ? { ...c, damage } : c)) }, summary: `${part.name} takes ${through}: ${Number.isFinite(max) ? `${max - part.damage} → ${max - damage} hit points` : `${damage} damage in all`}` };
}

/** Adds a line to the ship's log, newest first, keeping the last hundred. */
export function shipLog(doc: ShipDoc, line: string, at: string): ShipDoc {
  return { ...doc, log: [{ at, text: line.slice(0, 300) }, ...doc.log].slice(0, SHIP_LOG_LINES) };
}

/** What an upgrade costs this ship: its flat price plus its share of what the ship itself cost. */
export function upgradePrice(upgrade: RuleEntry, shipCost: number): number {
  const flat = typeof upgrade.cost === 'number' ? upgrade.cost : 0;
  const share = typeof upgrade.costPercent === 'number' ? Math.round((shipCost * upgrade.costPercent) / 100) : 0;
  return flat + share;
}

/** Days a voyage takes at the ship's pace, and whether the rations last. */
export function voyage(doc: ShipDoc, miles: number): { days: number; rationDays: number | null; enough: boolean | null } {
  const days = doc.pace.mph > 0 ? round2(travelDays(Math.max(0, miles), doc.pace.mph)) : Infinity;
  const aboard = doc.crew + doc.passengers;
  const rationDays = aboard > 0 ? round2(doc.rations / aboard) : null;
  return { days, rationDays, enough: rationDays === null ? null : rationDays >= days };
}
