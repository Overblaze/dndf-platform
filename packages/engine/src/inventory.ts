// What a character carries: items with a count and a weight, and berries. Weight is checked against
// carrying capacity (Strength × 15 lb and what changes it) and said when it is over; nothing is blocked.
import type { RuleEntry } from './types';

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  /** Weight of one, in pounds. */
  weight?: number;
  /** The armory entry it came from, when it did. */
  item?: string;
  notes?: string;
  /** false: left on the ship or at home. It stays in the list but does not count toward weight carried. */
  carried?: boolean;
}

export interface InventoryLine extends InventoryItem {
  /** qty × weight, in pounds; 0 when no weight is given. */
  total: number;
  carried: boolean;
}

/** "8 lb." → 8, "1/4 lb." → 0.25, "—" → undefined. */
export function parseWeight(text: unknown): number | undefined {
  if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : undefined;
  const m = /(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)/.exec(String(text ?? ''));
  if (!m) return undefined;
  if (m[1] && m[2]) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined;
  return Number(m[3]);
}

/** ฿1,250,000: every berry, for a purse (bounty.ts has the short form, ฿1.25M). */
export function exactBerries(amount: number): string {
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

/** An armory entry as something carried. */
export function inventoryFromItem(entry: RuleEntry, id: string, qty = 1): InventoryItem {
  return { id, name: entry.name, qty, weight: parseWeight(entry.weight), item: entry.id };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Every item with its total weight, and the weight carried against the capacity. */
export function carriedWeight(items: InventoryItem[] | undefined, capacity: number): { lines: InventoryLine[]; carried: number; capacity: number; over: boolean } {
  const lines = (items ?? []).map((item) => {
    const qty = Number.isFinite(item.qty) ? Math.max(0, item.qty) : 0;
    const each = typeof item.weight === 'number' && Number.isFinite(item.weight) ? Math.max(0, item.weight) : 0;
    return { ...item, qty, carried: item.carried !== false, total: round(qty * each) };
  });
  const carried = round(lines.reduce((sum, line) => sum + (line.carried ? line.total : 0), 0));
  return { lines, carried, capacity, over: carried > capacity };
}
