// The DM Guide's bounty suggestion (PDF p107). Players may edit their bounty freely;
// this is the "calculated" value shown beside it. Amounts are in berries (฿).
import type { Derived } from './types';

export const RARITY_LEVEL: Record<string, number> = { Uncommon: 1, Rare: 2, 'Very Rare': 3, Legendary: 4 };

export interface BountyInput {
  level: number;
  crewmates?: number;
  /** Rarity of the Devil Fruit eaten, if any (Uncommon 1 … Legendary 4). */
  fruitRarity?: string | null;
  /** Rarity of the character's strongest Haki feature. */
  topHakiRarity?: string | null;
  minorDeeds?: number;
  majorDeeds?: number;
  shipCon?: number;
  extraShips?: number;
  /** Berries plundered; counted twice. */
  plunder?: number;
  civiliansHarmed?: number;
  citiesDestroyed?: number;
  navyShipsSunk?: number;
  noblesHarmed?: number;
}

const M = 1_000_000;

export function bounty(input: BountyInput): Derived {
  const rarity = (r?: string | null) => (r ? RARITY_LEVEL[r] ?? 0 : 0);
  const parts: [string, number][] = [
    [`Level ${input.level} squared × ฿1M`, input.level ** 2 * M],
    [`Crewmates ${input.crewmates ?? 0} × ฿1M`, (input.crewmates ?? 0) * M],
    [`Devil Fruit rarity ${rarity(input.fruitRarity)} × ฿10M`, rarity(input.fruitRarity) * 10 * M],
    [`Top Haki rarity ${rarity(input.topHakiRarity)} × ฿10M`, rarity(input.topHakiRarity) * 10 * M],
    [`Minor deeds ${input.minorDeeds ?? 0} × ฿10M`, (input.minorDeeds ?? 0) * 10 * M],
    [`Major deeds ${input.majorDeeds ?? 0} × ฿100M`, (input.majorDeeds ?? 0) * 100 * M],
    [`Ship Constitution ${input.shipCon ?? 0} × ฿1M`, (input.shipCon ?? 0) * M],
    [`Extra ships ${input.extraShips ?? 0} × ฿10M`, (input.extraShips ?? 0) * 10 * M],
    ['Plunder × 2', (input.plunder ?? 0) * 2],
    [`Civilians ${input.civiliansHarmed ?? 0} × ฿100K`, (input.civiliansHarmed ?? 0) * 100_000],
    [`Cities ${input.citiesDestroyed ?? 0} × ฿10M`, (input.citiesDestroyed ?? 0) * 10 * M],
    [`Navy ships ${input.navyShipsSunk ?? 0} × ฿10M`, (input.navyShipsSunk ?? 0) * 10 * M],
    [`Nobles ${input.noblesHarmed ?? 0} × ฿100M`, (input.noblesHarmed ?? 0) * 100 * M],
  ];
  const lines = parts.filter(([, value]) => value !== 0).map(([label, value]) => ({ label, value }));
  return { value: lines.reduce((sum, l) => sum + l.value, 0), lines, page: 107, book: 'DnDF DM Guide' };
}

/** ฿112M, ฿1.5B, ฿250K. */
export function formatBerries(amount: number): string {
  const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (Math.abs(amount) >= size) return `฿${Number((amount / size).toFixed(2))}${suffix}`;
  }
  return `฿${amount}`;
}

/** The parts of the bounty formula a player counts up themselves. */
export type BountyDeeds = Pick<BountyInput, 'crewmates' | 'minorDeeds' | 'majorDeeds' | 'shipCon' | 'extraShips' | 'plunder' | 'civiliansHarmed' | 'citiesDestroyed' | 'navyShipsSunk' | 'noblesHarmed'>;
export const BOUNTY_DEEDS: { key: keyof BountyDeeds; label: string; each: string }[] = [
  { key: 'crewmates', label: 'Crewmates', each: '฿1M each' },
  { key: 'minorDeeds', label: 'Minor deeds', each: '฿10M each' },
  { key: 'majorDeeds', label: 'Major deeds', each: '฿100M each' },
  { key: 'shipCon', label: 'Your ship’s Constitution', each: '฿1M a point' },
  { key: 'extraShips', label: 'Extra ships', each: '฿10M each' },
  { key: 'plunder', label: 'Berries plundered', each: 'counted twice' },
  { key: 'civiliansHarmed', label: 'Civilians harmed', each: '฿100K each' },
  { key: 'citiesDestroyed', label: 'Cities destroyed', each: '฿10M each' },
  { key: 'navyShipsSunk', label: 'Navy ships sunk', each: '฿10M each' },
  { key: 'noblesHarmed', label: 'Nobles harmed', each: '฿100M each' },
];
export const WANTED_TERMS = ['Dead or Alive', 'Only Alive', 'Only Dead'] as const;
export type WantedTerms = (typeof WANTED_TERMS)[number];

/** A poster as issued: what the world has been told, until a new one is put out. */
export interface WantedPoster {
  value: number;
  epithet?: string;
  terms?: WantedTerms;
  /** The day it was issued, as an ISO date. */
  at?: string;
}

export interface BountyRecord {
  deeds?: BountyDeeds;
  /** "Straw Hat", "Pirate Hunter". */
  epithet?: string;
  terms?: WantedTerms;
  posted?: WantedPoster;
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined);
const words = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);
const terms = (value: unknown) => (WANTED_TERMS as readonly unknown[]).includes(value) ? (value as WantedTerms) : undefined;

/** A saved bounty record with every part the right kind of thing; undefined when there is nothing in it. */
export function cleanBounty(raw: unknown): BountyRecord | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const record: BountyRecord = {};
  const deeds: BountyDeeds = {};
  for (const { key } of BOUNTY_DEEDS) {
    const n = count((r.deeds as Record<string, unknown> | undefined)?.[key]);
    if (n) deeds[key] = n;
  }
  if (Object.keys(deeds).length) record.deeds = deeds;
  if (words(r.epithet, 60)) record.epithet = words(r.epithet, 60);
  if (terms(r.terms)) record.terms = terms(r.terms);
  const posted = r.posted as Record<string, unknown> | undefined;
  if (posted && typeof posted === 'object' && count(posted.value) !== undefined) {
    record.posted = { value: count(posted.value)!, epithet: words(posted.epithet, 60), terms: terms(posted.terms), at: words(posted.at, 10) };
  }
  return Object.keys(record).length ? record : undefined;
}
