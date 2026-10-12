// A Devil Fruit infused into a weapon instead of eaten: the Devilforged's "Infuse Devil Fruit"
// (v8.8 p114–115 at 3rd level; v10 p114–116 at 1st). The weapon gains what the book gives for the
// fruit's type, read from the class's own sections, so each handbook's wording decides.
import type { ClassEntry, FeatureDef, RuleEntry, SectionDef } from './types';

/** The player's choice, kept on the character. It names the grant, never the fruit, so a saved or exported character gives nothing away. */
export interface FruitInfusion {
  /** The grant's id (the row the DM made). */
  grant: string;
  /** The weapon (one of the character's own) the fruit is infused into. */
  weaponId?: string;
  /** The feature of the fruit the weapon has gained, where the book gives one ("Fruit Effect"), by name. */
  effect?: string;
  /** The infusion type, when the player or DM has set it by hand (the book has none for some fruits). */
  as?: string;
  /** The kind of elemental damage chosen, where the book adds some. */
  element?: string;
}

export const INFUSE_FEATURE = 'Infuse Devil Fruit';
const SUFFIX = ' Infusion';

/** The class feature, with the class it belongs to; undefined when this handbook's rules are not loaded. */
export function infusionFeature(rules: Map<string, RuleEntry>): { cls: ClassEntry; feature: FeatureDef } | undefined {
  const cls = rules.get('class.devilforged') as ClassEntry | undefined;
  const feature = cls?.features.find((f) => f.name === INFUSE_FEATURE);
  return cls && feature ? { cls, feature } : undefined;
}

/** The infusion types this handbook prints: "Body Enhancer Paramecia", "Zoan", "Solid Logia"… */
export function infusionTypes(feature: FeatureDef): string[] {
  return (feature.sections ?? []).filter((s) => s.name.endsWith(SUFFIX)).map((s) => s.name.slice(0, -SUFFIX.length));
}

/**
 * The infusion type a fruit's own type line calls for: "Environment Alterer Paramecia" is the book's
 * "Environment Altering Paramecia", any Zoan (Standard, Ancient, Mythical…) is "Zoan". Null when the
 * line names none the handbook has a section for (a Special Logia in v8.8).
 */
export function infusionTypeOf(fruitType: string, types: string[]): string | null {
  const said = fruitType.toLowerCase();
  const wanted =
    /zoan/.test(said) ? 'Zoan'
    : /logia/.test(said) ? (/gas/.test(said) ? 'Gaseous Logia' : /liquid/.test(said) ? 'Liquid Logia' : /solid/.test(said) ? 'Solid Logia' : /special/.test(said) ? 'Special Logia' : null)
    : /paramecia/.test(said) ? (/body\s+en/.test(said) ? 'Body Enhancer Paramecia' : /environ?e?m?n?t?\w*\s+alter/.test(said) ? 'Environment Altering Paramecia' : /substance\s+(generat|produc)/.test(said) ? 'Substance Generator Paramecia' : /special/.test(said) ? 'Special Paramecia' : null)
    : null;
  return wanted && types.includes(wanted) ? wanted : null;
}

export const infusionSection = (feature: FeatureDef, type: string): SectionDef | undefined => (feature.sections ?? []).find((s) => s.name === `${type}${SUFFIX}`);

/** A section's benefits, each as the book leads it: "Damage Boost.", "Fruit Spells." */
export function infusionBenefits(section: SectionDef): { name: string; text: string }[] {
  return section.text.split('\n').flatMap((line) => {
    const led = /^([A-Z][\w’' -]{2,40})\. (.+)$/.exec(line.trim());
    return led ? [{ name: led[1]!, text: led[2]! }] : [];
  });
}

const RARITY_MODIFIER: Record<string, number> = { Uncommon: 1, Rare: 2, 'Very Rare': 3, Legendary: 4, Infernal: 5 };

export interface InfusionNumbers {
  /** The weapon's damage die goes up one size, to d12 at most. */
  dieStep: boolean;
  /** Added to the weapon's attack and damage rolls: the fruit's rarity modifier. */
  strikes: number;
  /** Extra damage dice on a hit, of an element close to the fruit's. */
  elemental: string | null;
  /** Feet the weapon's reach can grow by. */
  reach: number;
  /** Damage dice to creatures within 5 feet of the target on a hit. */
  splash: string | null;
  /** The weapon can cast from the fruit's spell list with Devil Fruit Infusion Charges. */
  spells: boolean;
  /** The benefit that hands the weapon one of the fruit's own features, by its name in the book. */
  effectBenefit: string | null;
}

/**
 * The numbers a section gives the weapon, each taken only where the section's own words say so.
 * A handbook that words a benefit differently gets its text shown and no number invented for it.
 */
export function infusionNumbers(section: SectionDef, rarity: string): InfusionNumbers {
  const words = section.text;
  const benefits = infusionBenefits(section);
  const rarityMod = RARITY_MODIFIER[rarity] ?? 0;
  return {
    dieStep: /Increase the weapon’s damage die by one size up to d12/i.test(words),
    strikes: /bonus to attack and damage rolls equal to the fruit’s rarity modifier/i.test(words) ? rarityMod : 0,
    elemental: /deals an additional (\d+d\d+) elemental damage/i.exec(words)?.[1] ?? null,
    reach: Number(/range can increase by up to (\d+) ?ft/i.exec(words)?.[1] ?? 0),
    splash: /dealing (\d+d\d+) damage to creatures within 5 feet/i.exec(words)?.[1] ?? null,
    spells: /cast a spell from the devil fruits? spell list using the Devil Fruit Infusion Charges table/i.test(words),
    effectBenefit: benefits.find((b) => /gains one (feature|of it’s non-awakening [\w ]+features?) from the fruit’s stat sheet/i.test(b.text))?.name ?? null,
  };
}

/**
 * Devil Fruit Infusion Charges for a character level, from the feature's own table ("3 | 3 | 2": level,
 * Paramecia, Logia). The row for the highest level reached counts; before the first row there are none.
 */
export function infusionCharges(feature: FeatureDef, level: number, category: string): number {
  const table = (feature.sections ?? []).find((s) => s.name === 'Devil Fruit Infusion Charges')?.tables?.[0];
  if (!table || (category !== 'paramecia' && category !== 'logia')) return 0;
  const head = table.rows.filter((row) => !/^\d/.test(row[0] ?? ''));
  const column = [1, 2].find((c) => head.some((row) => new RegExp(category, 'i').test(row[c] ?? '')));
  if (!column) return 0;
  let charges = 0;
  for (const row of table.rows) {
    const at = Number(/^(\d+)/.exec(row[0] ?? '')?.[1]);
    if (Number.isFinite(at) && at <= level) charges = Number(row[column]) || charges;
  }
  return charges;
}

/** The damage die one size larger, to d12 at most: "1d6" → "1d8". Anything that is not a single kind of die is left alone. */
export function biggerDie(dice: string): string {
  const read = /^(\d*)d(4|6|8|10|12)(.*)$/.exec(dice.trim());
  if (!read) return dice;
  const next = { 4: 6, 6: 8, 8: 10, 10: 12, 12: 12 }[Number(read[2]) as 4 | 6 | 8 | 10 | 12];
  return `${read[1] || '1'}d${next}${read[3]}`;
}
