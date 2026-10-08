// Spirit Surges: the Haki features and Standard Advancements a character has unlocked, what each
// one asks the player to choose, and which options a surge of a given rarity opens — p221–241.
import type { Ability, RuleEntry, RulesVersion } from './types';
import { HAKI_PURIST_LEVELS } from './general';

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const rarityRank = (rarity: unknown) => RARITIES.indexOf(rarity as Rarity);

export const HAKI_COLORS = [
  { id: 'armament', name: 'Color of Armament' },
  { id: 'observation', name: 'Color of Observation' },
  { id: 'supremeKing', name: 'Color of the Supreme King' },
] as const;
export type HakiColor = (typeof HAKI_COLORS)[number]['id'];

/** What the player chose where an advancement leaves a choice (Strengthen Self, Career Advancement …). */
export interface SurgePick {
  /** Strengthen Self: the ability score raised by 2. */
  ability?: Ability;
  /** Strengthen Self (v10): Willpower raised by 2 instead. */
  willpower?: boolean;
  /** Career Advancement: the skill; proficiency, or expertise when already proficient. */
  skill?: string;
  /** Warriors Path: a kind of armor or weapon. */
  proficiency?: { kind: 'armor' | 'weapon'; id: string };
  /** Muscle Memory: the resource whose uses are doubled. */
  resource?: string;
  /** Anything else the advancement leaves open (the cantrips learned, the weapons merged). */
  note?: string;
}

/** One advancement unlocked, with what the table wants remembered about the surge that gave it. */
export interface SurgeRecord {
  id: string;
  /** A hakiFeature or surgeAdvancement entry id. */
  entry: string;
  /** The rarity of the Spirit Surge event, which may be higher than the advancement's own. */
  rarity?: string;
  reason?: string;
  session?: string;
  /** When it was added, as an ISO date. */
  at?: string;
  pick?: SurgePick;
}

export type PuristPick = 'quality' | 'quantity' | 'stamina';
export const PURIST_PICKS: { id: PuristPick; name: string }[] = [
  { id: 'quality', name: 'Train Quality' },
  { id: 'quantity', name: 'Train Quantity' },
  { id: 'stamina', name: 'Train Stamina' },
];

interface SurgeDoc {
  rulesVersion: RulesVersion;
  classes: { level: number }[];
  surges?: SurgeRecord[];
  hakiPurist?: PuristPick[];
  qualitiesOfAKing?: boolean;
}

const levelOf = (doc: SurgeDoc) => doc.classes.reduce((total, c) => total + c.level, 0);

export interface HakiTaken {
  entry: RuleEntry;
  record: SurgeRecord;
  /** The Amateur feature this one took the place of at 5th level. */
  upgradedFrom?: RuleEntry;
}

/**
 * The Haki features a character has, each once. From 5th level an Amateur feature is its
 * Uncommon variant ("Upgrades to Enhanced Strike when you reach character level 5").
 */
export function hakiTaken(doc: SurgeDoc, rules: Map<string, RuleEntry>): HakiTaken[] {
  const level = levelOf(doc);
  const taken = new Map<string, HakiTaken>();
  for (const record of doc.surges ?? []) {
    const entry = rules.get(record.entry);
    if (entry?.kind !== 'hakiFeature') continue;
    const upgrade = level >= 5 && typeof entry.upgradesTo === 'string' ? rules.get(entry.upgradesTo) : undefined;
    const shown = upgrade ?? entry;
    // Taken outright as well as by upgrade: the one taken outright is the one listed.
    if (taken.has(shown.id) && upgrade) continue;
    taken.set(shown.id, { entry: shown, record, upgradedFrom: upgrade ? entry : undefined });
  }
  return [...taken.values()];
}

/**
 * Train Stamina adds a charge to Uncommon and Rare Haki features. In v8.8 a pick taken at 12th level
 * or later also covers Very Rare, and one taken at 20th also Legendary — p221. Picks are in the order
 * they were taken, so the nth pick is the one from the nth level that gives one.
 */
export function puristStamina(doc: SurgeDoc, rarity: unknown): number {
  const levels = HAKI_PURIST_LEVELS[doc.rulesVersion];
  let extra = 0;
  (doc.hakiPurist ?? []).forEach((pick, i) => {
    if (pick !== 'stamina') return;
    const at = levels[Math.min(i, levels.length - 1)]!;
    const covers = ['Uncommon', 'Rare'];
    if (doc.rulesVersion === 'dndf-8.8' && at >= 12) covers.push('Very Rare');
    if (doc.rulesVersion === 'dndf-8.8' && at >= 20) covers.push('Legendary');
    if (covers.includes(String(rarity))) extra += 1;
  });
  return extra;
}

export type SurgeTab = 'standard' | HakiColor | 'fruit' | 'amateur';
export const SURGE_TABS: { id: SurgeTab; name: string }[] = [
  { id: 'standard', name: 'Standard' },
  { id: 'armament', name: 'Armament' },
  { id: 'observation', name: 'Observation' },
  { id: 'supremeKing', name: 'Supreme King' },
  { id: 'fruit', name: 'Devil Fruit' },
  { id: 'amateur', name: 'Amateur' },
];

export interface SurgeOption {
  entry: RuleEntry;
  tab: SurgeTab;
  /** How many times it is already on the character. */
  taken: number;
  /** Why the rules would not offer it now. Shown greyed out; the player can still take it. */
  blocked: string[];
}

/** What the sheet knows that a prerequisite can ask about. */
export interface SurgeContext {
  /** Tier reached in each Color. */
  tiers: Record<HakiColor, number>;
  spellcaster: boolean;
  /** The types of the Devil Fruits held ("paramecia", "zoan", "logia"); empty without one. */
  fruitCategories?: string[];
}

/**
 * Every advancement in the character's handbook, with the reasons the rules would hold it back for a
 * surge of the rarity given. Nothing is ever refused: the reasons are shown and the choice stays the player's.
 */
export function surgeOptions(doc: SurgeDoc, rules: Map<string, RuleEntry>, surgeRarity: Rarity, context: SurgeContext): SurgeOption[] {
  const level = levelOf(doc);
  const records = doc.surges ?? [];
  const haki = hakiTaken(doc, rules);
  const hakiNames = new Set(haki.flatMap((h) => [h.entry.name, ...(h.upgradedFrom ? [h.upgradedFrom.name] : [])]));
  const options: SurgeOption[] = [];
  for (const entry of rules.values()) {
    if (entry.kind !== 'hakiFeature' && entry.kind !== 'surgeAdvancement' && entry.kind !== 'fruitAdvancement') continue;
    const taken = records.filter((r) => r.entry === entry.id).length + (haki.some((h) => h.entry.id === entry.id && h.upgradedFrom) ? 1 : 0);
    const blocked: string[] = [];
    if (taken > 0 && entry.repeatable !== true) blocked.push('Already taken; it can be chosen once');
    if (rarityRank(entry.rarity) > rarityRank(surgeRarity)) blocked.push(`Needs a ${String(entry.rarity)} Spirit Surge`);
    const color = entry.color as HakiColor | undefined;
    const tier = typeof entry.tier === 'number' ? entry.tier : 0;
    if (color && tier > 1 && (context.tiers[color] ?? 0) < tier) {
      blocked.push(`Needs Tier ${tier} in this Color (${tier === 2 ? 4 : 6} features of it)`);
    }
    const held = context.fruitCategories ?? [];
    if (entry.kind === 'fruitAdvancement') {
      // A fruit advancement's prerequisite is a sentence. The part that can be judged is the fruit type it names;
      // the rest is shown with the text and left to the player and the DM.
      const need = String(entry.prerequisite ?? '');
      const types = (need.match(/paramecia|zoan|logia/gi) ?? []).map((t) => t.toLowerCase());
      if (held.length === 0) blocked.push('Needs a Devil Fruit');
      else if (types.length && !types.some((t) => held.includes(t))) blocked.push(`Needs a ${[...new Set(types)].map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' or ')} fruit`);
    }
    for (const need of entry.kind === 'fruitAdvancement' ? [] : String(entry.prerequisite ?? '').split(/,\s*/).filter(Boolean)) {
      const range = /^Character level (\d+)\s*-\s*(\d+)$/i.exec(need);
      if (range) {
        if (level < Number(range[1]) || level > Number(range[2])) blocked.push(`For characters of level ${range[1]}–${range[2]}`);
      } else if (/^Qualities of a King$/i.test(need)) {
        if (!doc.qualitiesOfAKing) blocked.push('Needs Qualities of a King');
      } else if (/^Spellcaster$/i.test(need)) {
        if (!context.spellcaster) blocked.push('Needs a spellcaster');
      } else if (/DM Choice/i.test(need)) {
        // "Special Reactions (DM Choice)": the DM's call, so never held back here.
      } else if (!hakiNames.has(need)) {
        blocked.push(`Needs ${need}`);
      }
    }
    const tab: SurgeTab = entry.kind === 'fruitAdvancement' ? 'fruit' : entry.kind === 'surgeAdvancement' ? 'standard' : entry.amateur === true ? 'amateur' : color ?? 'standard';
    options.push({ entry, tab, taken, blocked });
  }
  return options.sort((a, b) => rarityRank(a.entry.rarity) - rarityRank(b.entry.rarity) || a.entry.name.localeCompare(b.entry.name));
}

/** What a standard advancement asks the player to choose, so the dialog knows what to show. */
export function surgeAsks(entry: RuleEntry, version: RulesVersion): ('abilityOrWillpower' | 'ability' | 'skill' | 'proficiency' | 'resource' | 'note')[] {
  switch (entry.id) {
    case 'surgeAdvancement.strengthen_self': return [version === 'dndf-10' ? 'abilityOrWillpower' : 'ability'];
    case 'surgeAdvancement.career_advancement': return ['skill'];
    case 'surgeAdvancement.warriors_path': return ['proficiency'];
    case 'surgeAdvancement.muscle_memory': return ['resource'];
    case 'surgeAdvancement.learn_technique':
    case 'surgeAdvancement.learn_custom_spell':
    case 'surgeAdvancement.multipurpose_weapon':
    case 'surgeAdvancement.borrow_skill':
      return ['note'];
    default: return [];
  }
}

export function newSurgeId(existing: SurgeRecord[] = []): string {
  let n = existing.length + 1;
  while (existing.some((r) => r.id === `surge-${n}`)) n++;
  return `surge-${n}`;
}
