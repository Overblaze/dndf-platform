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
