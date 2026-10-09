// Turns armory entries (data/rules, kind "item") into what a character carries.
import type { ArmorDef, WeaponDef } from './character';
import type { RuleEntry } from './types';

/** An armory weapon as a weapon on the sheet. Returns null for things that aren't rolled as a weapon (Net, Brass Knuckles). */
export function weaponFromItem(item: RuleEntry, id: string = item.id): WeaponDef | null {
  if (item.itemType !== 'weapon' || typeof item.damage !== 'string' || !/^\d*d\d+$/.test(item.damage)) return null;
  return {
    id,
    name: item.name,
    damage: item.damage,
    damageType: String(item.damageType ?? ''),
    category: item.category === 'martial' ? 'martial' : 'simple',
    ...(item.ranged === true ? { ranged: true } : {}),
    ...(item.finesse === true ? { finesse: true } : {}),
    ...(item.twoHanded === true ? { twoHanded: true } : {}),
    ...(item.heavy === true ? { heavy: true } : {}),
  };
}

/** An armory armor as worn armor: base AC plus Dexterity, in full, up to +2, or not at all. */
export function armorFromItem(item: RuleEntry): ArmorDef | null {
  const ac = item.ac as { base?: number; dex?: 'full' | 'max2' | 'none' } | undefined;
  if (item.itemType !== 'armor' || typeof ac?.base !== 'number') return null;
  return { name: item.name, base: ac.base, dexCap: ac.dex === 'full' ? null : ac.dex === 'max2' ? 2 : 0, ...(item.stealthDisadvantage === true ? { stealthDisadvantage: true } : {}) };
}
