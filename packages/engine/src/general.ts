// DnDF rules every character has (v10 p11–12), and Haki / Devil Fruit rows of docs/FORMULAS.md.
import type { DieRoll } from './bruiser';
import type { RulesVersion } from './types';

/** Dream Points = level; they reset on level-up. Each adds 1d6 to an attack, check or save after the roll — p11. */
export function dreamPointsMax(level: number): number {
  return level;
}
export const DREAM_POINT_DIE = '1d6';

/** Table ruling: spend up to half your total hit dice (minimum 1), limited by the dice you have left — p11. */
export function healingSurgeMaxDice(totalHitDice: number, remaining: number): number {
  return Math.min(Math.max(1, Math.floor(totalHitDice / 2)), remaining);
}

export const SPECIAL_REACTIONS_PER_ROUND = 2;

/** Each Special Reaction can be used proficiency-bonus times per short rest — p11. */
export function specialReactionUses(prof: number): number {
  return prof;
}

/** Parry Blow / Deflect Projectile reduce damage by 1d10 + level — p11. */
export function specialReactionReduction(level: number): DieRoll {
  return { count: 1, die: 'd10', bonus: level, text: `1d10 + ${level}` };
}

/** Pirate Prestige maximum: level / 2, rounded up — p12. */
export function piratePrestigeMax(level: number): number {
  return Math.ceil(level / 2);
}
export const MVP_PRESTIGE_DIE = '1d4';

/** Tier 2 at 4 features of a color, tier 3 at 6. Amateur (Common) features don't count — p221. */
export function hakiTier(featuresOfColor: { rarity: string }[]): 0 | 1 | 2 | 3 {
  const counted = featuresOfColor.filter((f) => !/^(amateur|common)$/i.test(f.rarity)).length;
  if (counted >= 6) return 3;
  if (counted >= 4) return 2;
  return featuresOfColor.length > 0 ? 1 : 0;
}

/** Levels that give a Haki Purist pick: 4, 10 and 16 in v10; 4, 8, 12, 16 and 20 in v8.8 — p221 of each. */
export const HAKI_PURIST_LEVELS: Record<RulesVersion, number[]> = { 'dndf-10': [4, 10, 16], 'dndf-8.8': [4, 8, 12, 16, 20] };

/** Haki Purist picks earned so far; all are lost on gaining a Devil Fruit — p221. */
export function hakiPuristPicks(level: number, hasDevilFruit: boolean, version: RulesVersion = 'dndf-10'): number {
  return hasDevilFruit ? 0 : HAKI_PURIST_LEVELS[version].filter((l) => level >= l).length;
}

export type FruitRarity = 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Infernal';

/** Power penalty variant: Very Rare −2 maximum charges, Legendary / Infernal −3 — p250. */
export function powerPenalty(rarity: FruitRarity): number {
  if (rarity === 'Very Rare') return 2;
  return rarity === 'Legendary' || rarity === 'Infernal' ? 3 : 0;
}

export interface FruitCharges {
  charges: number;
  highestSpellLevel: number;
}

/** Paramecia: 2 charges at levels 1–2, then = level (max 20); highest spell level ceil(level / 2), max 9 — Ency p8. */
export function parameciaCharges(level: number, penalty = 0): FruitCharges {
  const charges = level <= 2 ? 2 : Math.min(level, 20);
  return { charges: Math.max(0, charges - penalty), highestSpellLevel: Math.min(9, Math.ceil(level / 2)) };
}

const LOGIA_EARLY = [2, 2, 3, 3, 4, 4, 5];

/** Logia: 2,2,3,3,4,4,5 then level − 2; highest spell level ceil((level + 2) / 2), max 9 — Ency p11. */
export function logiaCharges(level: number, penalty = 0): FruitCharges {
  const charges = LOGIA_EARLY[level - 1] ?? Math.min(level, 20) - 2;
  return { charges: Math.max(0, charges - penalty), highestSpellLevel: Math.min(9, Math.ceil((level + 2) / 2)) };
}

/** Casting above a fruit spell's base level costs 1 more charge per level, up to the highest level — Ency p8. */
export function upcastCost(baseCost: number, baseLevel: number, castLevel: number, highestSpellLevel: number): number {
  if (castLevel < baseLevel || castLevel > highestSpellLevel) {
    throw new Error(`Can't cast a level ${baseLevel} fruit spell at level ${castLevel} (highest is ${highestSpellLevel})`);
  }
  return baseCost + (castLevel - baseLevel);
}

/** Zoan eater in human form: own score + half the beast's modifier (rounded up), max 20 — Ency p9. */
export function zoanHumanFormScore(ownScore: number, beastScore: number): number {
  const beastMod = Math.floor((beastScore - 10) / 2);
  return Math.max(ownScore, Math.min(20, ownScore + Math.ceil(beastMod / 2)));
}

/** Beast Form: proficiency-bonus uses per dawn, each lasting level / 2 hours (rounded up) — Ency p10. */
export function zoanBeastForm(level: number, prof: number): { uses: number; hours: number } {
  return { uses: prof, hours: Math.ceil(level / 2) };
}
