// What a character carries: items with a count and a weight, and berries. Weight is checked against
// carrying capacity (Strength × 15 lb and what changes it) and said when it is over; nothing is blocked.
import { CUSTOM_BONUS_TYPES, type CharacterDoc, type CustomBonusType, type CustomFeature, type WeaponDef } from './character';
import { parseDice } from './dice';
import type { RuleEntry } from './types';

export const ITEM_KINDS = ['weapon', 'armor', 'shield', 'wondrous', 'consumable', 'gear'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_NAMES: Record<ItemKind, string> = { weapon: 'Weapon', armor: 'Armor', shield: 'Shield', wondrous: 'Wondrous item', consumable: 'Consumable', gear: 'Gear' };
export const ITEM_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Mythical'] as const;

/**
 * What makes an item of the player's own work on the sheet. While the item is in use: a weapon is
 * listed under Attacks, armor sets Armor Class, a shield adds its 2, and its powers (numbers it adds,
 * charges, dice to roll, a standing note) behave exactly as one of the player's own features does.
 */
export interface CustomItem {
  kind: ItemKind;
  rarity?: string;
  /** What it is worth, in berries. */
  value?: number;
  /** What it is and does, in the player's or the DM's words. */
  text?: string;
  weapon?: Pick<WeaponDef, 'damage' | 'damageType' | 'category' | 'ranged' | 'finesse' | 'twoHanded' | 'heavy' | 'bonus'>;
  /** Armor formula: base + Dexterity modifier, limited to dexCap when set (0 for heavy armor, null for light). */
  armor?: { base: number; dexCap?: number | null };
  action?: CustomFeature['action'];
  /** Charges, and when they come back. */
  uses?: CustomFeature['uses'];
  rolls?: CustomFeature['rolls'];
  bonuses?: CustomFeature['bonuses'];
  /** A standing line for "In effect" (a resistance, an advantage). */
  note?: string;
}


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
  /** Set on an item the player made themselves: what it does on the sheet while it is in use. */
  custom?: CustomItem;
  /** True while a made item is in use (wielded, worn, attuned). */
  equipped?: boolean;
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
  // A debt reads "-฿750,000", the sign before the berry mark.
  const whole = Math.round(amount);
  return `${whole < 0 ? '-' : ''}฿${Math.abs(whole).toLocaleString('en-US')}`;
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

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const words = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);
const within = (value: unknown, min: number, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : undefined);
const rollable = (dice: unknown): dice is string => { if (typeof dice !== 'string' || !dice.trim()) return false; try { parseDice(dice); return true; } catch { return false; } };

/** A made item with every part the right kind of thing, or undefined when it is not one. Dice that cannot be rolled are dropped. */
export function cleanCustomItem(raw: unknown): CustomItem | undefined {
  if (!isObject(raw) || !(ITEM_KINDS as readonly unknown[]).includes(raw.kind)) return undefined;
  const item: CustomItem = { kind: raw.kind as ItemKind };
  const rarity = words(raw.rarity, 30);
  if (rarity) item.rarity = rarity;
  const value = within(raw.value, 0, 1e15);
  if (value !== undefined) item.value = value;
  const text = words(raw.text, 6000);
  if (text) item.text = text;
  if (item.kind === 'weapon' && isObject(raw.weapon) && typeof raw.weapon.damage === 'string' && /^\d*d\d+$/.test(raw.weapon.damage.trim())) {
    const w = raw.weapon;
    const bonus = within(w.bonus, -10, 10);
    item.weapon = {
      damage: (w.damage as string).trim(), damageType: words(w.damageType, 30) ?? '', category: w.category === 'martial' ? 'martial' : w.category === 'improvised' ? 'improvised' : 'simple',
      ...(w.ranged === true ? { ranged: true } : {}), ...(w.finesse === true ? { finesse: true } : {}), ...(w.twoHanded === true ? { twoHanded: true } : {}), ...(w.heavy === true ? { heavy: true } : {}),
      ...(bonus ? { bonus } : {}),
    };
  }
  if (item.kind === 'armor' && isObject(raw.armor)) {
    const base = within(raw.armor.base, 0, 40);
    if (base !== undefined) item.armor = { base, dexCap: raw.armor.dexCap === null || raw.armor.dexCap === undefined ? null : within(raw.armor.dexCap, 0, 10) ?? null };
  }
  if (raw.action === 'action' || raw.action === 'bonus' || raw.action === 'reaction') item.action = raw.action;
  if (isObject(raw.uses)) {
    const max = within(raw.uses.max, 0, 999);
    if (max) item.uses = { max, recharge: raw.uses.recharge === 'short' ? 'short' : 'long' };
  }
  if (Array.isArray(raw.rolls)) {
    const rolls = raw.rolls.filter(isObject).filter((r) => rollable(r.dice)).slice(0, 8).map((r) => ({
      label: words(r.label, 60) ?? (r.dice as string).trim(), dice: (r.dice as string).trim(),
      kind: (r.kind === 'heal' || r.kind === 'tempHp' || r.kind === 'other' ? r.kind : 'damage') as 'damage' | 'heal' | 'tempHp' | 'other',
    }));
    if (rolls.length) item.rolls = rolls;
  }
  if (Array.isArray(raw.bonuses)) {
    const seen = new Set<string>();
    const bonuses = raw.bonuses.filter(isObject).flatMap((b) => {
      const amount = within(b.value, -100, 100);
      if (!(CUSTOM_BONUS_TYPES as readonly unknown[]).includes(b.type) || !amount || seen.has(b.type as string)) return [];
      seen.add(b.type as string);
      return [{ type: b.type as CustomBonusType, value: amount }];
    });
    if (bonuses.length) item.bonuses = bonuses;
  }
  const note = words(raw.note, 200);
  if (note) item.note = note;
  return item;
}

/** Whether a made item changes anything on the sheet when put to use (a plain crate of oranges does not). */
export function itemDoesSomething(custom: CustomItem | undefined): boolean {
  return Boolean(custom && (custom.weapon || custom.armor || custom.kind === 'shield' || custom.uses || custom.rolls?.length || custom.bonuses?.length || custom.note || custom.action));
}

const BONUS_WORDS: Record<CustomBonusType, string> = { ac: 'AC', speed: 'ft speed', initiative: 'initiative', hp: 'hit points', attack: 'to attacks', damage: 'damage' };
const plus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** One line saying what a made item is and does: "Weapon · 1d8 slashing, +1 · +1 AC · 3 charges (long rest) · Rare". */
export function itemSummary(custom: CustomItem): string {
  const parts: string[] = [ITEM_KIND_NAMES[custom.kind]];
  if (custom.weapon) {
    const w = custom.weapon;
    const tags = [w.category === 'martial' ? 'martial' : w.category === 'simple' ? 'simple' : 'improvised', w.ranged ? 'ranged' : '', w.finesse ? 'finesse' : '', w.twoHanded ? 'two-handed' : '', w.heavy ? 'heavy' : ''].filter(Boolean).join(', ');
    parts.push(`${w.damage}${w.damageType ? ` ${w.damageType}` : ''}${w.bonus ? `, ${plus(w.bonus)} to hit and damage` : ''} (${tags})`);
  }
  if (custom.armor) parts.push(`AC ${custom.armor.base}${custom.armor.dexCap === 0 ? '' : custom.armor.dexCap == null ? ' + Dex' : ` + Dex (max ${custom.armor.dexCap})`}`);
  if (custom.kind === 'shield') parts.push('+2 AC');
  for (const b of custom.bonuses ?? []) parts.push(`${plus(b.value)} ${BONUS_WORDS[b.type]}`);
  if (custom.uses) parts.push(`${custom.uses.max} charge${custom.uses.max === 1 ? '' : 's'} (${custom.uses.recharge} rest)`);
  for (const r of custom.rolls ?? []) parts.push(`${r.label === r.dice ? '' : `${r.label} `}${r.dice}`);
  if (custom.note) parts.push(custom.note);
  if (custom.rarity) parts.push(custom.rarity);
  if (custom.value) parts.push(exactBerries(custom.value));
  return parts.join(' · ');
}

/** Whether an item is one whose powers count right now: made by the player, in use, on their person, and not all used up. */
export const itemInUse = (item: InventoryItem): boolean => Boolean(item.custom && item.equipped && item.carried !== false && item.qty > 0);

/**
 * The character as the sheet should work it out: the saved one, plus what the made items in use bring.
 * A weapon joins the weapons, armor is worn (the first, if the player is somehow using two), a shield
 * is taken up, and powers join the player's own features. Nothing is saved from here: put the item
 * away and it is all gone again.
 */
export function withEquippedItems(doc: CharacterDoc): CharacterDoc {
  const used = (doc.inventory ?? []).filter(itemInUse);
  if (used.length === 0) return doc;
  const weapons = [...doc.weapons];
  const features = [...(doc.customFeatures ?? [])];
  let armor = doc.armor;
  let shield = doc.shield;
  let worn = false;
  for (const item of used) {
    const custom = item.custom!;
    if (custom.weapon) weapons.push({ id: `item:${item.id}`, name: item.name, ...custom.weapon });
    if (custom.armor && !worn) { armor = { name: item.name, base: custom.armor.base, dexCap: custom.armor.dexCap }; worn = true; }
    if (custom.kind === 'shield') shield = true;
    if (custom.uses || custom.rolls?.length || custom.bonuses?.length || custom.note || custom.action || custom.text) {
      features.push({
        id: `item-${item.id}`, name: item.name, text: custom.text ?? '', origin: custom.rarity ? `Item (${custom.rarity})` : 'Item',
        ...(custom.action ? { action: custom.action } : {}), ...(custom.uses ? { uses: custom.uses } : {}), ...(custom.rolls ? { rolls: custom.rolls } : {}),
        ...(custom.bonuses ? { bonuses: custom.bonuses } : {}), ...(custom.note ? { note: custom.note } : {}),
      });
    }
  }
  return { ...doc, weapons, armor, shield, customFeatures: features };
}
