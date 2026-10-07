// Devilforged (v8.8) rows of docs/FORMULAS.md. The class itself is extracted in phase 3;
// these are the formulas its sheet will use.

/** Power save DC = 8 + proficiency + Charisma; power attack = proficiency + Charisma — v8.8 p113. */
export function devilforgedPower(prof: number, chaMod: number): { saveDc: number; attack: number } {
  return { saveDc: 8 + prof + chaMod, attack: prof + chaMod };
}

export const INFUSION_RARITY_MODIFIER: Record<string, number> = { Uncommon: 1, Rare: 2, 'Very Rare': 3, Legendary: 4 };

export interface InfusedWeaponInput {
  prof: number;
  /** Hell's Duelist uses Charisma for attack and damage — v8.8 p116. */
  abilityMod: number;
  /** Rarity of the infused Zoan fruit: its modifier is added to attack and damage — v8.8 p114–115. */
  fruitRarity: string;
  damageDie: string;
  baseReach?: number;
}

export function zoanInfusedWeapon(input: InfusedWeaponInput) {
  const rarity = INFUSION_RARITY_MODIFIER[input.fruitRarity] ?? 0;
  const damageBonus = input.abilityMod + rarity;
  return {
    toHit: input.prof + input.abilityMod + rarity,
    damageBonus,
    damage: `${input.damageDie} + ${damageBonus}`,
    /** Beastial Morph: reach +5 ft. */
    reach: (input.baseReach ?? 5) + 5,
  };
}

export interface BeastNumbers {
  ac: number;
  attack: number;
  damageBonus: number;
  walkSpeed: number;
}

/** Bestial Summon: the summoned beast gets +1 to attack, damage and AC — v8.8 p128. */
export function bestialSummon(beast: BeastNumbers): BeastNumbers {
  return { ...beast, ac: beast.ac + 1, attack: beast.attack + 1, damageBonus: beast.damageBonus + 1 };
}

/** Zoan Mount: while ridden, walking speed 60 ft and it can Dash as a bonus action — v8.8 p129. */
export function zoanMount(beast: BeastNumbers, ridden: boolean): BeastNumbers & { dashAsBonusAction: boolean } {
  return { ...beast, walkSpeed: ridden ? 60 : beast.walkSpeed, dashAsBonusAction: ridden };
}

/** Devil's Branding: + proficiency damage against the target, crit on 19–20, heal level + Charisma when it dies — v8.8 p116. */
export function devilsBranding(level: number, prof: number, chaMod: number) {
  return { damageBonus: prof, critRange: 19, healOnDeath: level + chaMod };
}
