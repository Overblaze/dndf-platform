// Turns a saved character + the rules data into every number on the sheet, each with
// its line-by-line breakdown. The website and the Discord bot both call this.
import { CUSTOM_BOOK, customFeatureDef, rulesFor } from './customClass';
import { DEFAULT_SETTINGS, SKILLS, crewRolesOf, type CampaignSettings, type CharacterDoc, type WeaponDef } from './character';
import { GENERAL_PAGES, HANDBOOKS } from './citations';
import { CONDITION_EFFECTS, defensesInText, type Defenses } from './conditions';
import { classColumns } from './classes';
import { abilityMod, maxHp, proficiencyBonus, signed } from './core';
import { fillTemplate, formatDice, parseDice, type DiceSpec, type RollMode } from './dice';
import { COMBINED_CASTERS, multiclassSlots, multiclassWarnings } from './multiclass';
import { devilFruitAttackBonus, devilFruitSaveDc, hakiAttackBonus, hakiSaveDc, willpower } from './dndf';
import { RARITY_LEVEL, bounty as bountyOf, type WantedPoster } from './bounty';
import { carriedWeight, withEquippedItems, type InventoryLine } from './inventory';
import { CUSTOM_SPELL_BOOK, spellKey, type SheetSpells } from './spells';
import { raceChoices, racePickLabel, racePicks as racePicks_, type RaceChoice, type RacePick } from './raceChoices';
import { NO_SECRETS, diceInText, fruitCategory, fruitParts, withSecrets, type Secrets, type SheetFruit } from './fruit';
import { evaluate, evaluateNumber, explain, type ExprScope } from './expr';
import { HAKI_PURIST_LEVELS, logiaCharges, parameciaCharges, zoanBeastForm, dreamPointsMax, hakiPuristPicks, hakiTier, healingSurgeMaxDice, piratePrestigeMax, specialReactionReduction, specialReactionUses } from './general';
import { HAKI_COLORS, hakiTaken, puristStamina, type HakiColor, type PuristPick, type SurgeRecord } from './surges';
import {
  ABILITIES,
  ABILITY_NAMES,
  type Ability,
  type AbilityScores,
  type BreakdownLine,
  type ClassEntry,
  type CounterDef,
  type Derived,
  type EffectDef,
  type FeatureDef,
  type OnUseDef,
  type OptionDef,
  type ResourceDef,
  type RollDef,
  type SectionDef,
  type TableDef,
  type RuleEntry,
  type ToggleDef,
  type TraitDef,
  type TrackerDef,
  type UsesDef,
} from './types';

/** A number on the sheet: what the rules give, and the player's own value if they set one. */
export interface Stat extends Derived {
  key: string;
  label: string;
  calculated: number;
  overridden: boolean;
}

export interface SheetResource {
  id: string;
  name: string;
  max: number;
  remaining: number;
  recharge: string;
  confirm?: string;
  page?: number;
  book?: string;
}

export interface SheetRoll {
  label: string;
  dice: string;
  kind: RollDef['kind'];
}

export interface SheetFeature {
  key: string;
  name: string;
  /** Word-for-word book text. */
  text: string;
  page: number;
  book: string;
  /** "Bruiser 3", "Black Fist Style 6", "Fury Features". */
  from: string;
  /** Where the end of the text comes from, when this handbook's own page cuts it off. */
  completedFrom?: { book: string; page: number };
  action?: string;
  cost?: Record<string, number>;
  /** Resource holding this feature's limited uses. */
  resource?: string;
  toggle?: string;
  rolls: SheetRoll[];
  displays: { label: string; value: string }[];
  onUse: OnUseDef[];
  counter?: string;
  sections: SectionDef[];
  tables: TableDef[];
}

export interface SheetToggle {
  id: string;
  label: string;
  on: boolean;
  feature: string;
  /** Resource spent when switching on. */
  resource?: string;
  /** Resources regained when switching on (Frenzied Rush). */
  regain: { resource: string; value: number }[];
}

/**
 * Whether a d20 roll is made with advantage or disadvantage, and why. Any advantage together with any
 * disadvantage is a straight roll, however many of each there are.
 */
export interface RollEdge {
  mode: 'normal' | 'advantage' | 'disadvantage';
  reasons: { mode: 'advantage' | 'disadvantage'; from: string }[];
}

export interface SheetAttack {
  id: string;
  name: string;
  toHit: Stat;
  /** Set when something gives this attack roll advantage or disadvantage. */
  edge?: RollEdge;
  /** "1d6 + 4" */
  damage: string;
  damageType: string;
  damageLines: BreakdownLine[];
  notes: string[];
}

export interface SheetSkill extends Stat {
  id: string;
  ability: Ability;
  proficient: boolean;
  expertise: boolean;
  /** Set when something gives this check advantage or disadvantage (heavy armor on Stealth). */
  edge?: RollEdge;
}

export interface SheetTracker {
  id: string;
  name: string;
  min: number;
  max: number;
  value: number;
  reset?: string;
  page?: number;
  levels?: TrackerDef['levels'];
}

export interface SheetCounter {
  id: string;
  label: string;
  count: number;
  value: number;
  reset: string;
  feature: string;
}

export interface Sheet {
  name: string;
  /** "Human (Standard) · Bruiser 7 (Black Fist Style)" */
  summary: string;
  level: number;
  /** `changes` lists what moved a score from the one written on the character, in order, when anything did. */
  abilities: Record<Ability, { score: number; mod: number; changes?: { label: string; to: number }[]; /** For a plain check with this ability. */ edge?: RollEdge }>;
  /** Set when something gives the initiative roll advantage or disadvantage. */
  initiativeEdge?: RollEdge;
  /** Magic items attuned to, against how many a character can be (three, 5e SRD 5.1 p. 206). Going over is said, not stopped. */
  attunement: { used: number; max: Stat; over: boolean; items: string[] };
  prof: Stat;
  /** `autoFail` names the condition that makes this save fail without a roll (paralyzed, stunned…). */
  saves: Record<Ability, Stat & { proficient: boolean; edge?: RollEdge; autoFail?: string }>;
  /** The conditions on the character now, with what each is doing to the sheet. One the character is immune to does nothing. */
  conditions: { name: string; known: boolean; immune?: string; effects: string[] }[];
  /** Damage the character resists, is immune to or is vulnerable to, and conditions it cannot be given, each with its source. */
  protections: Defenses;
  skills: SheetSkill[];
  passivePerception: Stat;
  initiative: Stat;
  ac: Stat;
  speed: Stat;
  /** Other ways of moving the character has: swimming, flying, climbing, burrowing. Empty for most. */
  speeds: SheetMovement[];
  maxHp: Stat;
  carry: Stat;
  willpower: Stat;
  hakiSaveDc: Stat;
  /** Table ruling; null when the campaign switches it off. */
  hakiAttack: Stat | null;
  /** `die` is the first class's; `pool` lists every class's dice, largest first, for multiclass characters. */
  hitDice: { die: number; total: number; remaining: number; pool: { die: number; count: number }[] };
  /** The character's handbook: the book every page on the sheet is in unless a feature names another. */
  book: string;
  dreamPoints: { max: number; remaining: number };
  prestigeMax: number;
  healingSurgeDice: number;
  specialReactionReduction: string;
  attacksPerAction: number;
  /** Numbers a class defines by formula (Ki save DC, Spirit attack modifier …), each with its breakdown. */
  formulas: (Stat & { from: string })[];
  /** This level's row of each class table (Ki Points 7, Martial Arts Die 1d8 …), spell slots left out. */
  classTable: { key: string; label: string; value: number | string; from: string }[];
  resources: SheetResource[];
  toggles: SheetToggle[];
  trackers: SheetTracker[];
  counters: SheetCounter[];
  attacks: SheetAttack[];
  features: SheetFeature[];
  /** The Special Reactions every character has, with the book's text when the general rules are loaded. */
  specialReactions: { id: string; resource: string; name: string; text: string; page: number; roll?: string }[];
  /** Book text of the universal rules the sheet applies (Dream Points, Healing Surge …), by name. */
  generalRules: Record<string, SectionDef>;
  /** Effects in force right now (resistances, advantage, exhaustion). */
  notes: { label: string; from: string }[];
  /** Features of the character's classes that the player has taken off the sheet. */
  takenOff: { key: string; name: string; from: string; page: number; book: string }[];
  /** Armor, weapons and tools the character is proficient with, each with where it comes from. */
  proficiencies: { armor: Proficiency[]; weapons: Proficiency[]; tools: Proficiency[] };
  /** Haki by Color, with the tier reached in each, and every Spirit Surge advancement on the character. */
  haki: {
    colors: { id: HakiColor; name: string; count: Stat; tier: 0 | 1 | 2 | 3; features: string[] }[];
    /** Haki Purist: picks the character's level has earned, the levels that give one, and the picks made. */
    purist: { earned: number; levels: number[]; picks: PuristPick[] };
    surges: { record: SurgeRecord; name: string; kind: string; rarity: string; page: number; book: string; feature?: string }[];
  };
  /** What the character carries, with the weight carried against carrying capacity. */
  gear: { lines: InventoryLine[]; carried: number; capacity: number; over: boolean };
  money: number;
  /** The bounty the DM Guide's formula suggests (the player's own number wins), and the poster last issued. */
  wanted: Stat;
  poster: WantedPoster | null;
  /** Spells known, the slots to cast them with, and each casting class's DC and attack modifier. */
  spellbook: SheetSpells;
  /** Racial pick-lists (Cyborg Upgrades), with how many the level gives and what is picked. */
  raceChoices: RaceChoice[];
  /** What a racial trait or a picked option leaves to choose (a skill, a tool, a weapon), with what is chosen. */
  racePicks: RacePick[];
  /** Devil Fruits the character holds, and ones they only know about. Empty unless private content was handed in. */
  fruits: SheetFruit[];
  knownFruits: SheetFruit[];
  /** Devil Fruit save DC and attack bonus; null without a fruit. */
  fruitSaveDc: Stat | null;
  fruitAttack: Stat | null;
  warnings: string[];
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export interface Proficiency {
  /** "light", "shields", "martial", "martial_ranged", a weapon's name as a slug, or a tool's. */
  id: string;
  name: string;
  from: string;
}

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const WEAPON_GROUPS: Record<string, string> = {
  simple: 'Simple weapons', martial: 'Martial weapons', improvised: 'Improvised weapons', simple_melee: 'Simple melee weapons',
  simple_ranged: 'Simple ranged weapons', martial_melee: 'Martial melee weapons', martial_ranged: 'Martial ranged weapons',
};
const weaponGroupName = (id: string) => WEAPON_GROUPS[id] ?? capital(id.replace(/_/g, ' '));

function stat(doc: CharacterDoc, key: string, label: string, derived: Derived): Stat {
  const own = doc.overrides[key];
  const overridden = typeof own === 'number' && Number.isFinite(own);
  const book = derived.page === undefined ? undefined : derived.book ?? HANDBOOKS[doc.rulesVersion];
  return { key, label, value: overridden ? own : derived.value, calculated: derived.value, overridden, lines: derived.lines, page: derived.page, book };
}

export const MOVEMENT_MODES = ['swim', 'fly', 'climb', 'burrow'] as const;
export type MovementMode = (typeof MOVEMENT_MODES)[number];
export const MOVEMENT_NAMES: Record<MovementMode, string> = { swim: 'Swim', fly: 'Fly', climb: 'Climb', burrow: 'Burrow' };

/** "30 ft, swim 25 ft, fly 10 ft": every speed in one line, for a summary, a printed sheet or the bot. */
export function speedLine(sheet: Pick<Sheet, 'speed' | 'speeds'>): string {
  return [`${sheet.speed.value} ft`, ...sheet.speeds.map((s) => `${MOVEMENT_NAMES[s.mode].toLowerCase()} ${s.stat.value} ft`)].join(', ');
}

export interface SheetMovement {
  mode: MovementMode;
  /** Overridable as `speed.swim` and so on. */
  stat: Stat;
  /** What gives it. */
  from: string;
  /** A condition the rules put on it: "Not while wearing medium or heavy armor". */
  note?: string;
}

const sum = (lines: BreakdownLine[]) => lines.reduce((total, l) => total + Number(l.value), 0);

/** Scrapper's definition: simple melee weapons without two-handed, cutlasses, kanabos and improvised weapons — v10 p86. */
export function isBruiserWeapon(weapon: WeaponDef): boolean {
  if (weapon.ranged) return false;
  if (weapon.category === 'improvised' || /^(cutlass|kanabo)$/i.test(weapon.name.trim())) return true;
  return weapon.category === 'simple' && !weapon.twoHanded;
}

/** Martial Arts' definition: shortswords and simple melee weapons without two-handed or heavy — p150. */
export function isMartialArtistWeapon(weapon: WeaponDef): boolean {
  if (weapon.ranged) return false;
  if (/^shortsword$/i.test(weapon.name.trim())) return true;
  return weapon.category === 'simple' && !weapon.twoHanded && !weapon.heavy;
}

/** Whether a class's fighting-style die applies to a weapon; every style covers unarmed strikes. */
function styleCovers(style: unknown, weapon: WeaponDef): boolean {
  if (style === 'martialArtist') return isMartialArtistWeapon(weapon);
  if (style === 'unarmedOnly') return false;
  return isBruiserWeapon(weapon);
}

/** "leadershipDice" → "Leadership Dice". */
export function columnLabel(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** What is left of a pool: never below zero or above its size, whatever a save says was spent. */
const left = (max: number, spent: number | undefined) => Math.min(max, Math.max(0, max - (Number.isFinite(spent) ? (spent as number) : 0)));
/** The dice a player typed, or null when they can't be read ("lots", "1d"). */
const readDice = (dice: string): DiceSpec | null => { try { return parseDice(dice); } catch { return null; } };
const averageOf = (dice: string) => (readDice(dice)?.terms ?? []).reduce((total, t) => total + (t.count * (t.sides + 1)) / 2, 0);
/** Haki Purist, Train Quality: "Increase the amount of dice rolled from your haki features by 1." */
function moreDice(rolls: SheetFeature['rolls'], extra: number): SheetFeature['rolls'] {
  if (!extra) return rolls;
  return rolls.map((roll) => {
    const spec = readDice(roll.dice);
    if (!spec?.terms[0]) return roll;
    spec.terms[0].count += extra;
    return { ...roll, dice: formatDice(spec) };
  });
}
const DIE_SIZES = [4, 6, 8, 10, 12];
/** A weapon's dice with each die one size larger, up to a largest size; null when nothing changes or it isn't dice. */
function stepDice(dice: string, largest: number): string | null {
  const spec = readDice(dice);
  if (!spec) return null;
  let changed = false;
  for (const term of spec.terms) {
    const next = DIE_SIZES[DIE_SIZES.indexOf(term.sides) + 1];
    if (DIE_SIZES.includes(term.sides) && next && next <= largest) { term.sides = next; changed = true; }
  }
  return changed ? formatDice(spec) : null;
}
/** A feature's roll buttons, leaving out any whose dice can't be read rather than failing the whole sheet. */
function rollButtons(rolls: RollDef[], scope: ExprScope): SheetFeature['rolls'] {
  return rolls.flatMap((r) => {
    try {
      return [{ label: r.label, kind: r.kind, dice: formatDice(parseDice(fillTemplate(r.dice, scope))) }];
    } catch {
      return [];
    }
  });
}

interface Source {
  entry: RuleEntry;
  cls: ClassEntry;
  classLevel: number;
  label: string;
}

interface ActiveFeature {
  def: FeatureDef | OptionDef;
  source: Source;
  from: string;
  key: string;
  /** For a chosen option: the feature it was chosen under. */
  parent?: string;
}

export function deriveSheet(saved: CharacterDoc, handbook: Map<string, RuleEntry>, settings: CampaignSettings = DEFAULT_SETTINGS, secrets: Secrets = NO_SECRETS): Sheet {
  // The saved character, with what the player's made items bring while they are in use.
  const doc = withEquippedItems(saved);
  // The handbook's rules, plus any classes the player wrote for this character and any private advancements it may see.
  const rules = withSecrets(rulesFor(doc, handbook), secrets, doc.rulesVersion);
  const heldFruits = secrets.granted.filter((g) => g.kind === 'owner' && g.entry.kind === 'devilFruit');
  const warnings: string[] = [];
  const level = doc.classes.reduce((total, c) => total + c.level, 0);

  // 1. Which features the character has.
  const sources: Source[] = [];
  const active: ActiveFeature[] = [];
  for (const picked of doc.classes) {
    const cls = rules.get(picked.id) as ClassEntry | undefined;
    if (!cls || cls.kind !== 'class') {
      warnings.push(`Class "${picked.id}" is not in the ${doc.rulesVersion} rules data.`);
      continue;
    }
    const entries: RuleEntry[] = [cls];
    const sub = picked.subclass ? rules.get(picked.subclass) : undefined;
    if (picked.subclass && !sub) warnings.push(`Subclass "${picked.subclass}" is not in the rules data.`);
    if (sub) entries.push(sub);
    for (const entry of entries) {
      const source: Source = { entry, cls, classLevel: picked.level, label: entry.name };
      sources.push(source);
      for (const def of entry.features ?? []) {
        if (def.level > picked.level) continue;
        // A player's class may have two features with one name: its own features are told apart by id.
        const key = `${entry.id}/${typeof def.customId === 'string' ? def.customId : slug(def.name)}`;
        active.push({ def, source, from: `${entry.name} ${def.level}`, key });
        if (!def.choices) continue;
        const group = rules.get(def.choices.from);
        const options = (group?.options ?? []) as OptionDef[];
        for (const id of doc.choices[def.choices.id] ?? []) {
          const option = options.find((o) => o.id === id);
          if (option && group) active.push({ def: option, source: { ...source, entry: group }, from: group.name, key: `${group.id}/${option.id}`, parent: key });
          else warnings.push(`"${id}" is not one of the ${group?.name ?? def.choices.from}.`);
        }
      }
    }
  }

  // Features the player took off the character: gone from the sheet with everything they did, and
  // listed so they can be put back.
  const takenOff = new Set(doc.removedFeatures ?? []);
  const offSheet: Sheet['takenOff'] = [];
  for (let i = active.length - 1; i >= 0; i--) {
    const a = active[i]!;
    // Options picked under a feature leave with it; they come back when it does.
    if (a.parent && takenOff.has(a.parent) && !takenOff.has(a.key)) { active.splice(i, 1); continue; }
    if (!takenOff.has(a.key)) continue;
    offSheet.unshift({ key: a.key, name: a.def.name, from: a.from, page: a.def.page, book: a.source.entry.source.book });
    active.splice(i, 1);
  }

  // Features from outside the character's classes. Their expressions read the character's whole level,
  // against the table of the class they come from (or the first class, for the player's own).
  const home = sources[0];
  const borrowedPools: ResourceDef[] = [];
  for (const borrowed of doc.borrowedFeatures ?? []) {
    const entry = rules.get(borrowed.entry);
    const def = ((entry?.features ?? entry?.options ?? []) as (FeatureDef | OptionDef)[]).find((f) => f.name === borrowed.name);
    // An option list is named after its class: optionGroup.martial_artist_… belongs to class.martial_artist.
    const owner = entry?.kind === 'class' ? entry : entry?.kind === 'subclass' ? rules.get(String(entry.parent))
      : entry ? [...rules.values()].find((e) => e.kind === 'class' && entry.id.startsWith(`optionGroup.${e.id.slice(6)}_`)) : undefined;
    const cls = (owner?.kind === 'class' ? owner : home?.cls) as ClassEntry | undefined;
    if (!entry || !def || !cls) {
      warnings.push(`Borrowed feature "${borrowed.name}" is not in the rules data.`);
      continue;
    }
    const key = `${entry.id}/${slug(def.name)}`;
    if (active.some((a) => a.key === key)) continue; // already the character's own
    active.push({ def, source: { entry, cls, classLevel: Math.min(20, level), label: entry.name }, from: `${entry.name} (borrowed)`, key });
    // A borrowed feature that spends a pool the character does not have brings the pool with it.
    for (const id of Object.keys((def.cost ?? {}) as Record<string, number>)) {
      const pool = (cls.resources ?? []).find((r) => r.id === id);
      if (pool && !sources.some((s) => s.cls === cls) && !borrowedPools.includes(pool)) borrowedPools.push(pool);
    }
  }
  const borrowedSource = (pool: ResourceDef): Source | undefined => {
    const cls = [...rules.values()].find((e): e is ClassEntry => e.kind === 'class' && ((e as ClassEntry).resources ?? []).includes(pool));
    return cls ? { entry: cls, cls, classLevel: Math.min(20, level), label: cls.name } : undefined;
  };
  {
    const own: RuleEntry = { id: 'custom', kind: 'rule', name: 'Custom', versions: [doc.rulesVersion], source: { book: CUSTOM_BOOK, page: 0 } };
    // They need a class only to read from; with none to be found (a class missing from the rules) a blank one will do.
    const blank: ClassEntry = { ...own, kind: 'class', hitDie: 8, features: [] };
    for (const custom of doc.customFeatures ?? []) {
      const def = customFeatureDef(custom, 1, `custom.${custom.id}`);
      active.push({ def, source: { entry: own, cls: home?.cls ?? blank, classLevel: Math.max(1, level), label: 'Custom' }, from: custom.origin?.trim() || 'Custom', key: `custom/${custom.id}` });
    }
  }

  // The race's traits, and what was picked from its lists. They read the whole character's level and belong to no class.
  const race = doc.race.id ? rules.get(doc.race.id) : undefined;
  const subrace = doc.race.subraceId ? rules.get(doc.race.subraceId) : undefined;
  if (doc.race.id && !race) warnings.push(`Race "${doc.race.id}" is not in the rules data.`);
  const racialTraits = [race, subrace].flatMap((r) => ((r?.traits ?? []) as TraitDef[]).map((trait) => ({ trait, entry: r! })));
  const racePicks = raceChoices(doc, rules);
  // Traits the sheet does not list (Speed) can still carry numbers: a Fishman's swimming speed.
  const unlisted: { def: FeatureDef; from: string }[] = [];
  {
    const blank: ClassEntry = { id: 'race', kind: 'class', name: 'Race', versions: [doc.rulesVersion], source: { book: HANDBOOKS[doc.rulesVersion], page: 67 }, hitDie: 8, features: [] };
    for (const { trait, entry } of racialTraits) {
      // Descriptive traits stay in the Library; the sheet lists the ones a player uses.
      if (/^(age|alignment|size|speed|ability score increase|subrace)$/i.test(trait.name)) {
        if (((trait as unknown as FeatureDef).effects ?? []).length) unlisted.push({ def: { ...trait, level: 1 } as unknown as FeatureDef, from: entry.name });
        continue;
      }
      const from = entry.kind === 'subrace' ? `${race?.name ?? ''} (${entry.name})` : entry.name;
      // A trait's skills are granted through "skills"; its pick-list is handled below, not as a class choice.
      const def = { ...trait, level: 1, choices: undefined } as unknown as FeatureDef;
      active.push({ def, source: { entry, cls: blank, classLevel: Math.max(1, level), label: entry.name }, from, key: `${entry.id}/${slug(trait.name)}` });
    }
    for (const choice of racePicks) {
      for (const id of choice.picked) {
        const option = choice.options.find((o) => o.id === id);
        if (!option) { warnings.push(`"${id}" is not one of the ${choice.name}.`); continue; }
        active.push({ def: option, source: { entry: choice.group, cls: blank, classLevel: Math.max(1, level), label: choice.from }, from: `${choice.from}: ${choice.name}`, key: `${choice.group.id}/${option.id}` });
      }
    }
  }

  // Haki features unlocked by Spirit Surges. They read the whole character's level and belong to no class.
  const surgeRecords = doc.surges ?? [];
  const haki = hakiTaken(doc, rules);
  {
    const blank: ClassEntry = { id: 'haki', kind: 'class', name: 'Haki', versions: [doc.rulesVersion], source: { book: HANDBOOKS[doc.rulesVersion], page: 221 }, hitDie: 8, features: [] };
    for (const { entry, upgradedFrom } of haki) {
      const color = HAKI_COLORS.find((c) => c.id === entry.color)?.name ?? 'Haki';
      const def = { ...entry, level: 1, page: entry.source.page } as unknown as FeatureDef;
      active.push({
        def,
        source: { entry, cls: blank, classLevel: Math.max(1, level), label: color },
        from: `${color} · ${String(entry.rarity ?? '')}${upgradedFrom ? ` (was ${upgradedFrom.name})` : ''}`,
        key: entry.id,
      });
    }
  }
  const advancements = surgeRecords.flatMap((record) => {
    const entry = rules.get(record.entry);
    if (entry?.kind === 'surgeAdvancement' || entry?.kind === 'fruitAdvancement') return [{ record, entry }];
    // A Devil Fruit advancement is private: without it in hand (a printed or public sheet) it is left out, not named.
    if (entry?.kind !== 'hakiFeature' && !record.entry.startsWith('fruitAdvancement.')) warnings.push(`Spirit Surge advancement "${record.entry}" is not in the ${doc.rulesVersion} rules data.`);
    return [];
  });
  const advancementsOf = (id: string) => advancements.filter((a) => a.entry.id === `surgeAdvancement.${id}`);
  // "You immediately lose access to all of these improvements when your character gains Devil Fruit powers."
  const puristDoc = heldFruits.length ? { ...doc, hakiPurist: [] } : doc;

  // 2. Ability scores, after features that raise them (The King) and Strengthen Self.
  const scores: AbilityScores = { ...doc.scores };
  for (const { record } of advancementsOf('strengthen_self')) {
    const ability = record.pick?.ability;
    if (ability && ABILITIES.includes(ability) && !record.pick?.willpower) scores[ability] = Math.max(scores[ability], Math.min(scores[ability] + 2, 20));
  }
  const scoreChanges: Partial<Record<Ability, { label: string; to: number }[]>> = {};
  const moved = (ability: Ability, to: number, label: string) => {
    if (to === scores[ability]) return;
    scores[ability] = to;
    (scoreChanges[ability] ??= []).push({ label, to });
  };
  for (const { def } of active) {
    for (const effect of (def.effects ?? []) as EffectDef[]) {
      if (effect.type !== 'ability' || !effect.ability || !ABILITIES.includes(effect.ability)) continue;
      const raised = scores[effect.ability] + (effect.value ?? 0);
      const to = Math.max(scores[effect.ability], Math.min(raised, effect.max ?? raised));
      // Only what the player's own features and items do is listed; the book's raises were never itemised.
      if (def.page === 0) moved(effect.ability, to, `${def.name}: ${signed(effect.value ?? 0)}`); else scores[effect.ability] = to;
    }
  }
  // "Your score is 19 while you wear this. It has no effect on you if your score is already 19 or higher."
  // Applied after every raise, so it never stacks with one.
  for (const { def } of active) {
    for (const effect of (def.effects ?? []) as EffectDef[]) {
      if (effect.type !== 'abilitySet' || !effect.ability || !ABILITIES.includes(effect.ability) || typeof effect.value !== 'number') continue;
      if (effect.value > scores[effect.ability]) moved(effect.ability, effect.value, `${def.name}: set to ${effect.value}`);
    }
  }
  const abilities = {} as Sheet['abilities'];
  const mod: Record<string, number> = {};
  for (const a of ABILITIES) {
    abilities[a] = { score: scores[a], mod: abilityMod(scores[a]), ...(scoreChanges[a] ? { changes: scoreChanges[a] } : {}) };
    mod[a] = abilities[a].mod;
  }

  const prof = stat(doc, 'prof', 'Proficiency bonus', {
    value: proficiencyBonus(level),
    lines: [{ label: 'Base', value: 2 }, { label: `Level ${level}: (level − 1) ÷ 4, rounded down`, value: Math.floor((level - 1) / 4) }],
    page: GENERAL_PAGES[doc.rulesVersion].proficiency,
  });

  // Willpower, which Haki features read. Strengthen Self counts whether it was typed into the builder or taken as a surge.
  const variant = doc.willpower.variantAdvancements;
  const wp = stat(doc, 'willpower', 'Willpower', willpower({
    level,
    strengthenSelf: doc.willpower.strengthenSelf + (doc.rulesVersion === 'dndf-10' ? advancementsOf('strengthen_self').filter((a) => a.record.pick?.willpower).length : 0),
    variant: typeof variant === 'number' ? { spiritualAdvancements: variant } : undefined,
  }));

  // 3. What rules expressions can see.
  const toggleDefs = active.flatMap((a) => (a.def.toggle ? [{ def: a.def.toggle as ToggleDef, feature: a }] : []));
  const on: ExprScope = {};
  for (const { def } of toggleDefs) on[def.id] = Boolean(doc.state.toggles[def.id]);
  // Tracker values (Hybrid Points held) are visible to expressions as tracker.<id>.
  const tracker: ExprScope = {};
  for (const source of sources) {
    for (const def of (source.entry.trackers ?? []) as TrackerDef[]) tracker[def.id] = doc.state.trackers[def.id] ?? def.min;
  }
  const scopeFor = (source: Source, extra: ExprScope = {}): ExprScope => ({
    level: source.classLevel,
    prof: prof.value,
    willpower: wp.value,
    mod,
    col: classColumns(source.cls, source.classLevel),
    on,
    tracker,
    noArmor: doc.armor === null,
    noShield: !doc.shield,
    wearingArmor: doc.armor !== null,
    // Heavy armor is the kind that adds no Dexterity.
    heavyArmor: doc.armor?.dexCap === 0,
    mediumArmor: typeof doc.armor?.dexCap === 'number' && doc.armor.dexCap > 0,
    bruiserWeapon: false,
    melee: false,
    ranged: false,
    twoHanded: false,
    weapon: '',
    ...extra,
  });

  // Features that don't come from a class (race, background, crew role, feats) see the whole character's level.
  const plainScope: ExprScope = {
    level, prof: prof.value, willpower: wp.value, mod, on, tracker, noArmor: doc.armor === null, noShield: !doc.shield, wearingArmor: doc.armor !== null,
    heavyArmor: doc.armor?.dexCap === 0, mediumArmor: typeof doc.armor?.dexCap === 'number' && doc.armor.dexCap > 0,
    bruiserWeapon: false, melee: false, ranged: false, twoHanded: false, weapon: '',
  };

  // The character's race, background, crew role and feats, from the rules data.
  const background = doc.background ? rules.get(doc.background.id) : undefined;
  const crewRoles: RuleEntry[] = [];
  for (const { id } of crewRolesOf(doc)) {
    const role = rules.get(id);
    if (role) crewRoles.push(role);
    else warnings.push(`Crew role "${id}" is not in the rules data.`);
  }
  if (doc.background && !background) warnings.push(`Background "${doc.background.id}" is not in the rules data.`);
  const feats: RuleEntry[] = [];
  for (const id of new Set(doc.feats ?? [])) {
    const feat = rules.get(id);
    if (feat?.kind === 'feat') feats.push(feat);
    else warnings.push(`Feat "${id}" is not in the rules data.`);
  }

  interface ActiveEffect {
    effect: EffectDef;
    /** What the effect's expressions can see: its class's table and level, or the whole character for a feat. */
    scopeOf: (extra?: ExprScope) => ExprScope;
    from: string;
    page?: number;
  }
  const effects: ActiveEffect[] = [];
  for (const a of active) {
    for (const effect of (a.def.effects ?? []) as EffectDef[]) effects.push({ effect, scopeOf: (x) => scopeFor(a.source, x), from: a.def.name, page: a.def.page });
  }
  for (const { def, feature } of toggleDefs) {
    if (!on[def.id]) continue;
    for (const effect of def.effects ?? []) effects.push({ effect, scopeOf: (x) => scopeFor(feature.source, x), from: feature.def.name, page: feature.def.page });
  }
  for (const feat of feats) {
    for (const effect of (feat.effects ?? []) as EffectDef[]) effects.push({ effect, scopeOf: (x) => ({ ...plainScope, ...x }), from: feat.name, page: feat.source.page });
  }
  for (const { def, from } of unlisted) {
    for (const effect of (def.effects ?? []) as EffectDef[]) effects.push({ effect, scopeOf: (x) => ({ ...plainScope, ...x }), from, page: def.page });
  }
  // What was chosen where a racial trait or option says "of your choice": a proficiency like any other.
  const chosen = racePicks_(doc, rules);
  for (const pick of chosen) {
    for (const value of pick.picked) {
      const label = racePickLabel(pick, value).trim();
      if (!label) continue;
      const effect: EffectDef = value.startsWith('tool:') || pick.def.kind === 'tool' ? { type: 'toolProficiency', label }
        : pick.def.kind === 'weapon' ? { type: 'weaponProficiency', weapon: slug(value) }
        : { type: 'proficiency', skill: value };
      effects.push({ effect, scopeOf: (x) => ({ ...plainScope, ...x }), from: pick.from, page: pick.page });
    }
  }
  const applies = (e: ActiveEffect, extra?: ExprScope) => !e.effect.when || Boolean(evaluate(e.effect.when, e.scopeOf(extra)));
  const amount = (e: ActiveEffect, extra?: ExprScope) => (e.effect.expr ? evaluateNumber(e.effect.expr, e.scopeOf(extra)) : e.effect.value ?? 0);
  const ofType = (type: string, extra?: ExprScope) => effects.filter((e) => e.effect.type === type && applies(e, extra));
  const bonusLines = (type: string, extra?: ExprScope): BreakdownLine[] =>
    ofType(type, extra)
      .map((e) => ({ label: e.from, value: amount(e, extra) }))
      // A bonus worked out from something that can be zero (Hybrid Points held) is left out while it is zero.
      .filter((line, i) => line.value !== 0 || !ofType(type, extra)[i]!.effect.expr);

  const notes: Sheet['notes'] = ofType('note').map((e) => ({ label: String(e.effect.label ?? ''), from: e.from }));
  // Armor, weapon and tool proficiencies: each class's own, then what features and feats add.
  const proficiencies: Sheet['proficiencies'] = { armor: [], weapons: [], tools: [] };
  const grant = (list: Proficiency[], id: string, name: string, from: string) => {
    if (!list.some((p) => p.id === id)) list.push({ id, name, from });
  };
  const ARMOR_KINDS = ['light', 'medium', 'heavy'] as const;
  const grantArmor = (kind: string, from: string) => {
    const id = kind.replace(/_armor$/, '');
    if (id === 'all') for (const each of ARMOR_KINDS) grant(proficiencies.armor, each, `${capital(each)} armor`, from);
    else grant(proficiencies.armor, id, id === 'shields' ? 'Shields' : `${capital(id)} armor`, from);
  };
  for (const source of sources) {
    if (source.entry !== source.cls) continue;
    const own = source.cls.proficiencies as { armor?: string[]; weapons?: string[]; tools?: string[] } | undefined;
    for (const kind of own?.armor ?? []) grantArmor(kind, source.cls.name);
    for (const weapon of own?.weapons ?? []) grant(proficiencies.weapons, weapon, weaponGroupName(weapon), source.cls.name);
    for (const tool of own?.tools ?? []) grant(proficiencies.tools, slug(tool), tool, source.cls.name);
  }
  for (const e of ofType('armorProficiency')) if (typeof e.effect.armor === 'string') grantArmor(e.effect.armor, e.from);
  for (const e of ofType('weaponProficiency')) if (typeof e.effect.weapon === 'string') grant(proficiencies.weapons, e.effect.weapon, weaponGroupName(e.effect.weapon), e.from);
  for (const e of ofType('toolProficiency')) if (typeof e.effect.label === 'string') grant(proficiencies.tools, slug(e.effect.label), e.effect.label, e.from);
  for (const { record } of advancementsOf('warriors_path')) {
    const picked = record.pick?.proficiency;
    if (picked?.kind === 'armor' && typeof picked.id === 'string') grantArmor(picked.id, 'Warriors Path');
    if (picked?.kind === 'weapon' && typeof picked.id === 'string') grant(proficiencies.weapons, picked.id, weaponGroupName(picked.id), 'Warriors Path');
  }
  // Armor worn or a shield carried without the proficiency: said plainly, never blocked.
  const armorKind = doc.armor ? (doc.armor.dexCap === 0 ? 'heavy' : doc.armor.dexCap == null ? 'light' : 'medium') : undefined;
  const unproficient = 'disadvantage on Strength and Dexterity checks, saves and attack rolls, and you can’t cast spells';
  const armorUnproficient = Boolean(doc.armor && !(doc.armor.proficient ?? proficiencies.armor.some((p) => p.id === armorKind)));
  const shieldUnproficient = Boolean(doc.shield && !proficiencies.armor.some((p) => p.id === 'shields'));
  if (doc.armor && armorUnproficient) notes.push({ label: `Not proficient with ${armorKind} armor: ${unproficient}`, from: doc.armor.name });
  if (shieldUnproficient) notes.push({ label: `Not proficient with shields: ${unproficient}`, from: 'Shield' });
  // Armor that hinders sneaking: as its own entry says, or for armor from the armory, as the armory says for that name.
  const armorEntry = doc.armor ? [...rules.values()].find((e) => e.kind === 'item' && e.itemType === 'armor' && e.name === doc.armor!.name) : undefined;
  const noisyArmor = Boolean(doc.armor && (doc.armor.stealthDisadvantage ?? armorEntry?.stealthDisadvantage === true));
  if (doc.armor && noisyArmor) notes.push({ label: 'Disadvantage on Dexterity (Stealth) checks', from: doc.armor.name });

  const exhaustion = doc.state.exhaustion;
  // Resistances, immunities and vulnerabilities: the player's own, what features and items give, and what a
  // feature's standing note plainly says ("Resistance to cold damage").
  const defenses: Defenses = { resist: [], immune: [], vulnerable: [], conditions: [] };
  const defend = (kind: keyof Defenses, what: string, from: string) => {
    const tidy = what.trim().toLowerCase();
    if (tidy && !defenses[kind].some((d) => d.what === tidy && d.from === from)) defenses[kind].push({ what: tidy, from });
  };
  for (const kind of ['resist', 'immune', 'vulnerable', 'conditions'] as const) for (const what of doc.defenses?.[kind] ?? []) defend(kind, what, 'Your own');
  for (const e of ofType('defense')) if (typeof e.effect.what === 'string' && ['resist', 'immune', 'vulnerable', 'conditions'].includes(String(e.effect.kind))) defend(e.effect.kind as keyof Defenses, e.effect.what, e.from);
  for (const note of notes) for (const found of defensesInText(note.label)) defend(found.kind, found.what, note.from);
  // Conditions: the fourteen the rules define act on the sheet; one typed in by the player is a note.
  const conditions: Sheet['conditions'] = [...new Set(doc.state.conditions.map((c) => c.trim().slice(0, 40)).filter(Boolean))].map((name) => {
    const known = CONDITION_EFFECTS[name];
    const immune = defenses.conditions.find((d) => d.what === name.toLowerCase())?.from;
    return { name, known: Boolean(known), ...(immune ? { immune } : {}), effects: immune ? [] : known?.notes ?? [] };
  });
  const acting = conditions.filter((c) => c.known && !c.immune).map((c) => ({ name: c.name, does: CONDITION_EFFECTS[c.name]! }));
  for (const c of conditions) {
    if (c.immune) notes.push({ label: `${c.name}: immune (${c.immune}), so it does nothing`, from: c.name });
    else if (!c.known) notes.push({ label: c.name, from: 'Condition' });
    else for (const label of c.effects) notes.push({ label, from: c.name });
  }
  for (const { name, does } of acting) {
    for (const what of does.resist ?? []) defend('resist', what, name);
    for (const what of does.immune ?? []) defend('immune', what, name);
  }
  /**
   * Advantage and disadvantage on one kind of d20 roll, from everything that gives either: features and
   * items, armor that hinders Stealth, armor or a shield worn without proficiency, exhaustion.
   * A skill check and initiative are ability checks, so what applies to an ability's checks applies to them.
   */
  const edgeOf = (on: 'skill' | 'save' | 'check' | 'attack' | 'initiative', target: { skill?: string; ability?: Ability } = {}): RollEdge | undefined => {
    const reasons: RollEdge['reasons'] = [];
    const isCheck = on === 'skill' || on === 'check' || on === 'initiative';
    for (const e of ofType('rollMode')) {
      const mode = e.effect.mode === 'advantage' ? 'advantage' : e.effect.mode === 'disadvantage' ? 'disadvantage' : null;
      if (!mode) continue;
      const wants = e.effect.on;
      const hit = wants === on
        ? (on !== 'skill' || !e.effect.skill || e.effect.skill === target.skill) && (!e.effect.ability || e.effect.ability === target.ability)
        : wants === 'check' && isCheck && (!e.effect.ability || e.effect.ability === target.ability);
      if (hit) reasons.push({ mode, from: e.from });
    }
    for (const { name, does } of acting) {
      for (const e of does.edges ?? []) {
        const hit = e.on === 'attack' ? on === 'attack' : e.on === 'check' ? isCheck : on === 'save' && (!e.ability || e.ability === target.ability);
        if (hit) reasons.push({ mode: e.mode, from: name });
      }
    }
    if (on === 'skill' && target.skill === 'stealth' && noisyArmor) reasons.push({ mode: 'disadvantage', from: doc.armor!.name });
    const physical = target.ability === 'str' || target.ability === 'dex';
    if (physical || on === 'attack') {
      if (armorUnproficient) reasons.push({ mode: 'disadvantage', from: `Not proficient with ${armorKind} armor` });
      if (shieldUnproficient) reasons.push({ mode: 'disadvantage', from: 'Not proficient with shields' });
    }
    if (exhaustion >= 1 && isCheck) reasons.push({ mode: 'disadvantage', from: `Exhaustion ${exhaustion}` });
    if (exhaustion >= 3 && (on === 'attack' || on === 'save')) reasons.push({ mode: 'disadvantage', from: `Exhaustion ${exhaustion}` });
    if (reasons.length === 0) return undefined;
    const up = reasons.some((r) => r.mode === 'advantage');
    const down = reasons.some((r) => r.mode === 'disadvantage');
    return { mode: up && down ? 'normal' : up ? 'advantage' : 'disadvantage', reasons };
  };
  const withEdge = <T extends object>(thing: T, edge: RollEdge | undefined): T => (edge ? { ...thing, edge } : thing);
  for (const a of ABILITIES) { const edge = edgeOf('check', { ability: a }); if (edge) abilities[a] = { ...abilities[a], edge }; }
  const exhaustionNote = (min: number, label: string) => exhaustion >= min && notes.push({ label, from: `Exhaustion ${exhaustion}` });
  exhaustionNote(1, 'Disadvantage on ability checks');
  exhaustionNote(3, 'Disadvantage on attack rolls and saving throws');

  // 4. Proficiencies.
  const first = sources[0];
  const saveProfs = new Set<Ability>([...((first?.cls.savingThrows as Ability[] | undefined) ?? []), ...(doc.extraSaves ?? [])]);
  const skillProfs = new Set(doc.skills);
  // Skills granted outright by a background, crew role, feat or racial trait.
  for (const granted of [background, ...crewRoles, ...feats, ...racialTraits.map((t) => t.trait as unknown as RuleEntry)]) {
    for (const skill of (granted?.skills ?? []) as string[]) skillProfs.add(skill);
  }
  for (const e of ofType('proficiency')) if (typeof e.effect.skill === 'string') skillProfs.add(e.effect.skill);
  // Features that double proficiency in a named skill (Hawk-Eyed) or add a saving throw (Slippery Mind).
  const expertiseIn = new Set(doc.expertise);
  for (const e of ofType('expertise')) if (typeof e.effect.skill === 'string') expertiseIn.add(e.effect.skill);
  for (const e of ofType('saveProficiency')) if (e.effect.ability) saveProfs.add(e.effect.ability);
  // Career Advancement: proficiency in the skill, or expertise when the character already has it.
  for (const { record } of advancementsOf('career_advancement')) {
    const skill = record.pick?.skill;
    if (typeof skill !== 'string' || !SKILLS.some((s) => s.id === skill)) continue;
    if (skillProfs.has(skill)) expertiseIn.add(skill);
    else skillProfs.add(skill);
  }

  const saves = {} as Sheet['saves'];
  for (const a of ABILITIES) {
    const lines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[a]} modifier`, value: mod[a]! }];
    if (saveProfs.has(a)) lines.push({ label: 'Proficiency bonus', value: prof.value });
    for (const e of ofType('saveBonus')) if (!e.effect.ability || e.effect.ability === a) lines.push({ label: e.from, value: amount(e) });
    const fails = acting.find((c) => c.does.autoFailSaves?.includes(a))?.name;
    saves[a] = withEdge({ ...stat(doc, `save.${a}`, `${ABILITY_NAMES[a]} save`, { value: sum(lines), lines }), proficient: saveProfs.has(a), ...(fails ? { autoFail: fails } : {}) }, edgeOf('save', { ability: a }));
  }

  // Jack of All Trades: half proficiency on ability checks that don't already include it.
  const halfProf = ofType('halfProficiency').slice(0, 1);
  const skills: SheetSkill[] = SKILLS.map((skill) => {
    const proficient = skillProfs.has(skill.id);
    const expertise = proficient && expertiseIn.has(skill.id);
    const lines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[skill.ability]} modifier`, value: mod[skill.ability]! }];
    if (proficient) lines.push({ label: expertise ? 'Proficiency bonus × 2 (expertise)' : 'Proficiency bonus', value: prof.value * (expertise ? 2 : 1) });
    else for (const e of halfProf) lines.push({ label: `${e.from}: half proficiency, rounded down`, value: Math.floor(prof.value / 2) });
    for (const e of ofType('skillBonus')) if (!e.effect.skill || e.effect.skill === skill.id) lines.push({ label: e.from, value: amount(e) });
    return withEdge({ ...stat(doc, `skill.${skill.id}`, skill.name, { value: sum(lines), lines }), id: skill.id, ability: skill.ability, proficient, expertise }, edgeOf('skill', { skill: skill.id, ability: skill.ability }));
  });
  const perception = skills.find((s) => s.id === 'perception')!;
  const passivePerception = stat(doc, 'passivePerception', 'Passive Perception', {
    value: 10 + perception.value + sum(bonusLines('passivePerception')),
    lines: [{ label: 'Base', value: 10 }, { label: 'Perception', value: perception.value }, ...bonusLines('passivePerception')],
  });

  // 5. Armor class: the best formula available, then shield and bonuses.
  const acOptions: { label: string; lines: BreakdownLine[]; page?: number }[] = [
    { label: 'Unarmored', lines: [{ label: 'Base', value: 10 }, { label: 'Dexterity modifier', value: mod.dex! }] },
  ];
  if (doc.armor) {
    const cap = doc.armor.dexCap;
    const dex = typeof cap === 'number' ? Math.min(mod.dex!, cap) : mod.dex!;
    acOptions.length = 0;
    acOptions.push({
      label: doc.armor.name,
      lines: [{ label: doc.armor.name, value: doc.armor.base }, { label: typeof cap === 'number' ? `Dexterity modifier (max ${cap})` : 'Dexterity modifier', value: dex }],
    });
  }
  for (const e of ofType('acFormula')) {
    acOptions.push({ label: e.from, lines: explain(e.effect.expr!, e.scopeOf()).lines, page: e.page });
  }
  const bestAc = acOptions.reduce((best, option) => (sum(option.lines) > sum(best.lines) ? option : best));
  const acLines = [...bestAc.lines];
  if (bestAc.label !== 'Unarmored' && !doc.armor) acLines[0] = { label: `Base (${bestAc.label})`, value: acLines[0]!.value };
  if (doc.shield) acLines.push({ label: 'Shield', value: 2 });
  acLines.push(...bonusLines('ac'));
  // Dark Armor: "your Armor Class can't be less than 5 + your Willpower".
  for (const e of ofType('acMinimum')) {
    const least = amount(e);
    if (sum(acLines) < least) acLines.push({ label: `${e.from}: can’t be less than ${least}`, value: least - sum(acLines) });
  }
  const ac = stat(doc, 'ac', 'Armor Class', { value: sum(acLines), lines: acLines, page: bestAc.page });

  // 6. Speed, initiative, hit points, carrying.
  const speedLines: BreakdownLine[] = [{ label: doc.race.name, value: doc.race.speed }, ...bonusLines('speed')];
  const held = acting.find((c) => c.does.speedZero);
  if (held) speedLines.push({ label: `${held.name}: speed 0`, value: -sum(speedLines) });
  else if (exhaustion >= 5) speedLines.push({ label: `Exhaustion ${exhaustion}: speed 0`, value: -sum(speedLines) });
  else if (exhaustion >= 2) speedLines.push({ label: `Exhaustion ${exhaustion}: speed halved`, value: -Math.ceil(sum(speedLines) / 2) });
  const speed = stat(doc, 'speed', 'Speed', { value: sum(speedLines), lines: speedLines });
  // Swimming, flying, climbing and burrowing. Two sources of one do not add up: the faster is used.
  const speeds: SheetMovement[] = [];
  const everySpeed: BreakdownLine[] = ofType('speed').filter((e) => e.effect.walking !== true).map((e) => ({ label: e.from, value: amount(e) })).filter((line) => line.value !== 0);
  for (const mode of MOVEMENT_MODES) {
    // What raises or lowers "your speed" raises or lowers every speed (Offensive Defense, Mobile); what names the
    // walking speed (Fleet Footed, Trick Rider) does not. A speed "equal to your walking speed" has it all already.
    const sources = ofType('movement', { walk: speed.value }).filter((e) => e.effect.mode === mode).map((e) => {
        const base = amount(e, { walk: speed.value });
        const follows = /\bwalk\b/.test(e.effect.expr ?? '');
        const extra = follows ? [] : everySpeed;
        return { e, base, extra, value: Math.max(0, base + sum(extra)) };
      });
    const best = sources.reduce<(typeof sources)[number] | undefined>((top, s) => (!top || s.value > top.value ? s : top), undefined);
    if (!best) continue;
    const lines: BreakdownLine[] = [{ label: best.e.effect.expr === 'walk' ? `${best.e.from}: equal to walking speed` : best.e.from, value: best.base }, ...best.extra];
    if (sum(lines) < 0) lines.push({ label: 'A speed cannot be less than 0', value: -sum(lines) });
    if (held) lines.push({ label: `${held.name}: speed 0`, value: -best.value });
    else if (exhaustion >= 5) lines.push({ label: `Exhaustion ${exhaustion}: speed 0`, value: -best.value });
    else if (exhaustion >= 2) lines.push({ label: `Exhaustion ${exhaustion}: speed halved`, value: -Math.ceil(best.value / 2) });
    speeds.push({
      mode, from: best.e.from, ...(typeof best.e.effect.note === 'string' ? { note: best.e.effect.note } : {}),
      stat: stat(doc, `speed.${mode}`, `${MOVEMENT_NAMES[mode]} speed`, { value: sum(lines), lines, page: best.e.page }),
    });
  }

  const initLines: BreakdownLine[] = [{ label: 'Dexterity modifier', value: mod.dex! }, ...bonusLines('initiative')];
  for (const e of halfProf) initLines.push({ label: `${e.from}: half proficiency, rounded down`, value: Math.floor(prof.value / 2) });
  const initiative = stat(doc, 'initiative', 'Initiative', { value: sum(initLines), lines: initLines, page: 52 });

  const hpLines: BreakdownLine[] = [];
  doc.classes.forEach((picked, i) => {
    const cls = rules.get(picked.id) as ClassEntry | undefined;
    if (!cls?.hitDie) return;
    hpLines.push(...maxHp({ hitDie: cls.hitDie, level: picked.level, conMod: mod.con!, rolls: picked.hpRolls, first: i === 0 }).lines);
  });
  // Feats and traits that add hit points per level (Tough).
  hpLines.push(...bonusLines('hp'));
  if (exhaustion >= 4) hpLines.push({ label: `Exhaustion ${exhaustion}: maximum halved`, value: -Math.ceil(sum(hpLines) / 2) });
  const maxHpStat = stat(doc, 'maxHp', 'Hit point maximum', { value: sum(hpLines), lines: hpLines, page: first?.cls.source.page });

  const carryLines: BreakdownLine[] = [{ label: `Strength ${scores.str} × 15 lb`, value: scores.str * 15 }];
  const multiply = (label: string, factor: number) => carryLines.push({ label, value: sum(carryLines) * (factor - 1) });
  for (const { trait } of racialTraits) {
    if (/one size larger when determining (?:your|their) carrying capacity/i.test(trait.text)) multiply(`${trait.name}: counts as one size larger, × 2`, 2);
  }
  for (let i = 0; i < (doc.race.sizeSteps ?? 0); i++) multiply('Counts as one size larger: × 2', 2);
  for (const e of ofType('carryMultiplier')) multiply(`${e.from}: × ${amount(e)}`, amount(e));
  const carry = stat(doc, 'carry', 'Carrying capacity', { value: sum(carryLines), lines: carryLines, page: 10 });
  const inventory = carriedWeight(doc.inventory, carry.value);
  if (inventory.over) notes.push({ label: `Carrying ${inventory.carried} lb, more than your capacity of ${carry.value} lb`, from: 'Gear' });

  // 7. Willpower and Haki.
  const hakiDc = stat(doc, 'hakiSaveDc', 'Haki save DC', hakiSaveDc(wp.value));
  const hakiAttack = settings.hakiAttackRuling ? stat(doc, 'hakiAttack', 'Haki attack', hakiAttackBonus(wp.value)) : null;

  // 8. Resources: class pools, limited-use features, and the rules every character has.
  const resourceDefs: { def: ResourceDef; source?: Source; page?: number }[] = [];
  for (const source of sources) {
    for (const def of ((source.entry as ClassEntry).resources ?? [])) {
      if (source.classLevel >= (def.minLevel ?? 1)) resourceDefs.push({ def, source, page: source.entry.source.page });
    }
  }
  for (const pool of borrowedPools) {
    const source = borrowedSource(pool);
    if (source) resourceDefs.push({ def: pool, source, page: source.entry.source.page });
  }
  const featureResource = new Map<string, string>();
  for (const a of active) {
    const uses = a.def.uses as UsesDef | string | undefined;
    if (!uses) continue;
    if (typeof uses === 'string') {
      featureResource.set(a.key, uses.slice(4));
    } else {
      // A player's own feature keeps its counter by its id, so renaming it does not reset what is spent.
      const isHaki = a.key.startsWith('hakiFeature.');
      const id = isHaki || /^(race|subrace)\./.test(a.key) || racePicks.some((c) => a.key.startsWith(`${c.group.id}/`)) || a.key.startsWith('custom/') || a.key.startsWith('class.custom.') ? `use.${a.key}` : `use.${slug(a.def.name)}`;
      featureResource.set(a.key, id);
      // Haki Purist, Train Stamina: one more charge for the Haki features it covers.
      const stamina = isHaki ? puristStamina(puristDoc, (a.def as { rarity?: unknown }).rarity) : 0;
      const max = stamina ? `(${uses.max}) + ${stamina}` : uses.max;
      resourceDefs.push({ def: { id, name: a.def.name, max, recharge: uses.recharge }, source: a.source, page: a.def.page });
    }
  }
  // Multiclass spellcasters: the classes the handbook names pool their levels and read the
  // Multiclass Spellcaster table; every other class keeps the slots of its own table.
  const pooled = sources.filter((source) => source.entry === source.cls && COMBINED_CASTERS.includes(source.cls.id));
  const pooledLevel = pooled.reduce((total, source) => total + source.classLevel, 0);
  const merged = new Map<string, { def: ResourceDef; calculated: number; page?: number; book?: string }>();
  for (const { def, source, page } of resourceDefs) {
    const slot = /^slots(\d)$/.exec(def.id);
    let calculated = evaluateNumber(def.max, source ? scopeFor(source) : plainScope);
    if (slot && pooled.length > 1 && source && pooled.some((p) => p.cls === source.cls)) {
      // Counted once, for the first pooled class; the others add nothing more.
      calculated = source.cls === pooled[0]!.cls ? multiclassSlots(pooledLevel, Number(slot[1])) : 0;
    }
    const same = merged.get(def.id);
    // The same pool from two classes (spell slots of the same level) is one pool on the sheet.
    if (same) same.calculated += calculated;
    else merged.set(def.id, { def, calculated, page, book: source?.entry.source.book });
  }
  if (pooled.length > 1) {
    for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
      const id = `slots${spellLevel}`;
      const count = multiclassSlots(pooledLevel, spellLevel);
      if (count > 0 && !merged.has(id)) {
        const ordinal = `${spellLevel}${spellLevel === 1 ? 'st' : spellLevel === 2 ? 'nd' : spellLevel === 3 ? 'rd' : 'th'}`;
        merged.set(id, { def: { id, name: `${ordinal}-level slots`, max: count, recharge: 'long' }, calculated: count, page: GENERAL_PAGES[doc.rulesVersion].multiclassing + 1, book: HANDBOOKS[doc.rulesVersion] });
      }
    }
  }
  // Muscle Memory: "Double the amount of uses of one class feature."
  for (const { record } of advancementsOf('muscle_memory')) {
    const doubled = record.pick?.resource ? merged.get(record.pick.resource) : undefined;
    if (doubled) doubled.calculated *= 2;
  }
  const resources: SheetResource[] = [...merged.values()].flatMap(({ def, calculated, page, book }) => {
    const max = stat(doc, `resource.${def.id}`, def.name, { value: calculated, lines: [] }).value;
    // Nothing to track yet (5th-level slots at level 3): leave it off the sheet.
    if (max <= 0) return [];
    return [{ id: def.id, name: def.name, max, remaining: left(max, doc.state.spent[def.id]), recharge: def.recharge, confirm: def.confirm, page, book }];
  });
  const general = (id: string, name: string, max: number) =>
    resources.push({ id, name, max, remaining: left(max, doc.state.spent[id]), recharge: 'short', page: 11 });
  // Special Reactions: all five from the general rules when they are loaded, else the two the formulas name.
  const reactionRules = (rules.get('rule.special_reactions')?.sections ?? []) as SectionDef[];
  const reductionRoll = specialReactionReduction(level).text;
  const reactionList = reactionRules.length
    ? reactionRules.map((r) => ({ name: r.name, text: r.text, page: r.page }))
    : [{ name: 'Deflect Projectile', text: '', page: 11 }, { name: 'Parry Blow', text: '', page: 11 }];
  const specialReactions: Sheet['specialReactions'] = reactionList.map((r) => {
    const id = slug(r.name).split('_')[0]!;
    general(`sr.${id}`, r.name, specialReactionUses(prof.value) + advancementsOf('improve_special_reactions').length);
    return { id, resource: `sr.${id}`, name: r.name, text: r.text, page: r.page, roll: /1d10 \+ their player level/.test(r.text) || !r.text ? reductionRoll : undefined };
  });
  general('healing_surge', 'Healing Surge', 1);
  const generalRules: Sheet['generalRules'] = {};
  for (const section of (rules.get('rule.universal_features')?.sections ?? []) as SectionDef[]) generalRules[section.name] = section;

  // 9. Toggles, trackers and counters.
  const toggles: SheetToggle[] = toggleDefs.map(({ def, feature }) => ({
    id: def.id,
    label: def.label,
    on: Boolean(on[def.id]),
    feature: feature.key,
    resource: featureResource.get(feature.key),
    regain: effects
      .filter((e) => e.effect.type === 'regainOnToggle' && e.effect.toggle === def.id)
      .map((e) => ({ resource: String(e.effect.resource), value: e.effect.value ?? 1 })),
  }));

  const trackers: SheetTracker[] = sources.flatMap((source) =>
    ((source.entry.trackers ?? []) as TrackerDef[]).filter((def) => source.classLevel >= (def.minLevel ?? 1)).map((def) => {
      const max = evaluateNumber(def.max, scopeFor(source));
      const value = Math.min(max, Math.max(def.min, doc.state.trackers[def.id] ?? def.min));
      return { id: def.id, name: def.name, min: def.min, max, value, page: def.page ?? source.entry.source.page, levels: def.levels, reset: def.reset };
    }),
  );

  const counters: SheetCounter[] = active.flatMap((a) => {
    const def = a.def.counter as CounterDef | undefined;
    if (!def) return [];
    const count = doc.state.counters[def.id] ?? 0;
    return [{ id: def.id, label: def.label, count, value: evaluateNumber(def.expr, scopeFor(a.source, { count })), reset: def.reset, feature: a.key }];
  });

  // 10. Attacks.
  // A class's fighting-style die (Scrapper, Martial Arts, Close Quarters Training) replaces a smaller
  // weapon die on unarmed strikes and the weapons that style covers.
  const styles = ofType('unarmedDie').map((e) => {
    const value = String(evaluate(e.effect.expr!, e.scopeOf()));
    return { from: e.from, dice: /^d/.test(value) ? `1${value}` : value, covers: e.effect.weapons, dexterity: e.effect.finesse === true };
  });
  const weaponProfs = new Set(proficiencies.weapons.map((p) => p.id));
  const proficientWith = (weapon: WeaponDef) =>
    weaponProfs.has(weapon.category) || weaponProfs.has(slug(weapon.name)) || weaponProfs.has(`${weapon.category}_${weapon.ranged ? 'ranged' : 'melee'}`);
  const unarmed: WeaponDef = { id: 'unarmed', name: 'Unarmed strike', damage: '1', damageType: 'bludgeoning', category: 'simple', proficient: true };

  const attacks: SheetAttack[] = [unarmed, ...doc.weapons].map((weapon) => {
    const isUnarmed = weapon.id === 'unarmed';
    const covering = styles.filter((style) => isUnarmed || styleCovers(style.covers, weapon));
    const style = covering.reduce<(typeof styles)[number] | undefined>((best, c) => (!best || averageOf(c.dice) > averageOf(best.dice) ? c : best), undefined);
    // `weapon` is the weapon's name in the singular ("mace"), for feats that favour one kind of weapon.
    const extra: ExprScope = { bruiserWeapon: covering.length > 0, melee: !weapon.ranged, ranged: Boolean(weapon.ranged), twoHanded: Boolean(weapon.twoHanded), weapon: slug(weapon.name) };
    const attackNotes: string[] = [];

    let ability: Ability = 'str';
    const dexAllowed = covering.some((c) => c.dexterity);
    if (weapon.ability) ability = weapon.ability;
    else if (weapon.ranged) ability = 'dex';
    else if ((dexAllowed || (weapon.finesse && covering.length === 0)) && mod.dex! > mod.str!) ability = 'dex';
    if (weapon.finesse && covering.length > 0 && !dexAllowed && !weapon.ability) attackNotes.push('Finesse can\'t be used with a bruiser weapon');

    const proficient = weapon.proficient ?? proficientWith(weapon);
    const hitLines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[ability]} modifier`, value: mod[ability]! }];
    if (proficient) hitLines.push({ label: 'Proficiency bonus', value: prof.value });
    else attackNotes.push('Not proficient');
    if (weapon.bonus) hitLines.push({ label: 'Item bonus', value: weapon.bonus });
    hitLines.push(...bonusLines('attack', extra).filter((l) => l.value !== 0));

    const useStyle = style !== undefined && averageOf(style.dice) > averageOf(weapon.damage);
    // Enhanced Strike and Focused Hit: the weapon's own die one size larger, never a class feature's die.
    const step = useStyle ? undefined : ofType('weaponDieStep', extra).reduce<ActiveEffect | undefined>((best, e) => (!best || (e.effect.max ?? 0) > (best.effect.max ?? 0) ? e : best), undefined);
    const stepped = step ? stepDice(weapon.damage, step.effect.max ?? 12) : null;
    if (step && stepped && step.effect.label) attackNotes.push(`${step.from}: the larger die ${String(step.effect.label)}; ${weapon.damage} otherwise`);
    const dice = useStyle ? style.dice : stepped ?? weapon.damage;
    const damageLines: BreakdownLine[] = [
      { label: useStyle ? `${style.from} die` : stepped ? `Weapon die ${weapon.damage}, one size larger (${step!.from})` : 'Weapon die', value: dice },
      { label: `${ABILITY_NAMES[ability]} modifier`, value: mod[ability]! },
    ];
    if (weapon.bonus) damageLines.push({ label: 'Item bonus', value: weapon.bonus });
    damageLines.push(...bonusLines('damage', extra).filter((l) => l.value !== 0));
    // Damage typed by hand may not be dice at all. Show it as typed and say so; the attack still rolls to hit.
    const spec = readDice(dice);
    const flat = damageLines.slice(1).reduce((total, l) => total + Number(l.value), 0);
    if (spec) spec.bonus += flat;
    else attackNotes.push(`Can't read "${String(dice).slice(0, 20)}" as dice: fix the weapon's damage in Edit`);

    return withEdge({
      id: weapon.id,
      name: weapon.name,
      toHit: stat(doc, `attack.${weapon.id}`, `${weapon.name} attack`, { value: sum(hitLines), lines: hitLines }),
      damage: spec ? formatDice(spec) : String(flat),
      damageType: weapon.damageType,
      damageLines,
      notes: attackNotes,
    }, edgeOf('attack', { ability }));
  });

  // 11. Features, with their dice and display values worked out.
  const purist = puristDoc.hakiPurist ?? [];
  const features: SheetFeature[] = active.map((a) => {
    const scope = scopeFor(a.source);
    const def = a.def;
    return {
      key: a.key,
      name: def.name,
      text: def.text,
      page: def.page,
      book: a.source.entry.source.book,
      from: a.from,
      action: def.action as string | undefined,
      cost: def.cost as Record<string, number> | undefined,
      resource: featureResource.get(a.key),
      toggle: (def.toggle as ToggleDef | undefined)?.id,
      rolls: a.key.startsWith('hakiFeature.') ? moreDice(rollButtons((def.rolls ?? []) as RollDef[], scope), purist.filter((p) => p === 'quality').length) : rollButtons((def.rolls ?? []) as RollDef[], scope),
      displays: ((def.effects ?? []) as EffectDef[])
        .filter((e) => e.type === 'display' && e.expr)
        .map((e) => ({ label: String(e.label ?? def.name), value: String(evaluate(e.expr!, scope)) })),
      onUse: (def.onUse ?? []) as OnUseDef[],
      counter: (def.counter as CounterDef | undefined)?.id,
      sections: (def.sections ?? []) as SectionDef[],
      tables: (def.tables ?? []) as TableDef[],
      completedFrom: def.completedFrom as SheetFeature['completedFrom'],
    };
  });

  // Race traits, the background's and crew role's features, and feats: shown with the class features.
  const extra = (key: string, name: string, text: string, page: number, entry: RuleEntry, from: string, more: Partial<SheetFeature> = {}) =>
    features.push({ key, name, text, page, book: entry.source.book, from, rolls: [], displays: [], onUse: [], sections: [], tables: [], ...more });
  for (const [granted, label] of [[background, 'Background'], ...crewRoles.map((role) => [role, 'Crew role'] as const)] as const) {
    for (const section of (granted?.sections ?? []) as SectionDef[]) {
      const m = /^(Feature|Pirate Prestige Ability): (.+)$/.exec(section.name);
      if (m) extra(`${granted!.id}/${slug(m[2]!)}`, m[2]!, section.text, section.page, granted!, `${label}: ${granted!.name}${m[1] === 'Feature' ? '' : ' (Pirate Prestige)'}`, { tables: section.tables ?? [] });
    }
  }
  for (const feat of feats) {
    const uses = feat.uses as UsesDef | undefined;
    let resource: string | undefined;
    if (uses && typeof uses === 'object') {
      resource = `use.${slug(feat.name)}`;
      const max = evaluateNumber(uses.max, plainScope);
      if (max > 0) resources.push({ id: resource, name: feat.name, max, remaining: left(max, doc.state.spent[resource]), recharge: uses.recharge, page: feat.source.page });
    }
    extra(`${feat.id}`, feat.name, String(feat.text ?? ''), feat.source.page, feat, 'Feat', {
      resource,
      rolls: rollButtons((feat.rolls ?? []) as RollDef[], plainScope),
      action: feat.action as string | undefined,
      sections: (feat.sections ?? []) as SectionDef[],
      tables: (feat.tables ?? []) as TableDef[],
    });
  }

  // Standard Advancements, each time one was taken, with what was chosen.
  for (const { record, entry } of advancements) {
    const pick = record.pick ?? {};
    const chose = [
      pick.willpower ? 'Willpower +2' : pick.ability ? `${ABILITY_NAMES[pick.ability] ?? pick.ability} +2` : '',
      pick.skill ? SKILLS.find((s) => s.id === pick.skill)?.name ?? '' : '',
      pick.proficiency && typeof pick.proficiency.id === 'string' ? (pick.proficiency.kind === 'armor' ? (pick.proficiency.id === 'shields' ? 'Shields' : `${capital(pick.proficiency.id)} armor`) : weaponGroupName(pick.proficiency.id)) : '',
      pick.resource ? resources.find((r) => r.id === pick.resource)?.name ?? '' : '',
      typeof pick.note === 'string' ? pick.note.slice(0, 80) : '',
    ].filter(Boolean).join(', ');
    const uses = entry.kind === 'fruitAdvancement' ? (entry.uses as UsesDef | undefined) : undefined;
    let resource: string | undefined;
    if (uses && typeof uses === 'object') {
      resource = `use.surge/${record.id}`;
      // Private data is not checked by the public schema: a count that cannot be worked out leaves the counter off rather than breaking the sheet.
      let max = 0;
      try { max = evaluateNumber(uses.max, plainScope); } catch { max = 0; }
      if (Number.isFinite(max) && max > 0) resources.push({ id: resource, name: entry.name, max, remaining: left(max, doc.state.spent[resource]), recharge: typeof uses.recharge === 'string' ? uses.recharge : 'long', page: entry.source.page, book: entry.source.book });
      else resource = undefined;
    }
    extra(`surge/${record.id}`, entry.name, String(entry.text ?? ''), entry.source.page, entry, `${entry.kind === 'fruitAdvancement' ? 'Devil Fruit advancement' : 'Spirit Surge'}${chose ? `: ${chose}` : ''}`, {
      resource,
      rolls: entry.kind === 'fruitAdvancement' ? rollButtons(diceInText(String(entry.text ?? '')), plainScope) : [],
    });
  }

  // Devil Fruits. A fruit held puts its features, charges and DC on the sheet; one only known about is there to read.
  // Counters are named by position, never by the fruit: the saved character must not say which fruit it is.
  const words = (value: unknown) => (typeof value === 'string' ? value : '');
  const fruitOf = (granted: Secrets['granted'][number], held: boolean, nth = 0): SheetFruit => {
    const entry = granted.entry;
    const parts = fruitParts(entry);
    const category = fruitCategory(entry);
    const keys: string[] = [];
    const pools: string[] = [];
    const poolId = (what: string) => `fruit${nth ? nth + 1 : ''}.${what}`;
    if (held) {
      const add = (p: { name: string; text: string; page: number }, label: string) => {
        const key = `fruit/${granted.key}/${slug(label)}/${slug(p.name)}`;
        if (features.some((f) => f.key === key)) return;
        keys.push(key);
        extra(key, p.name, p.text, p.page || entry.source.page, entry, `Devil Fruit: ${entry.name}${label === 'feature' ? '' : ` (${label})`}`, { rolls: rollButtons(diceInText(p.text), plainScope) });
      };
      parts.features.forEach((p) => add(p, 'feature'));
      parts.spells.forEach((p) => add(p, 'spells'));
      parts.awakening.forEach((p) => add(p, 'awakening'));
    }
    const table = category === 'paramecia' ? parameciaCharges(Math.max(1, level)) : category === 'logia' ? logiaCharges(Math.max(1, level)) : undefined;
    if (held && table) {
      const id = poolId('charges');
      pools.push(id);
      const max = stat(doc, `resource.${id}`, 'Devil Fruit charges', { value: table.charges, lines: [] }).value;
      if (max > 0) resources.push({ id, name: 'Devil Fruit charges', max, remaining: left(max, doc.state.spent[id]), recharge: 'dawn', page: entry.source.page, book: entry.source.book });
    }
    if (held && category === 'zoan') {
      const id = poolId('beast_form');
      pools.push(id);
      const max = zoanBeastForm(level, prof.value).uses;
      resources.push({ id, name: 'Beast Form', max, remaining: left(max, doc.state.spent[id]), recharge: 'dawn', page: entry.source.page, book: entry.source.book });
    }
    return {
      key: granted.key,
      name: entry.name,
      book: entry.source.book,
      page: entry.source.page,
      rarity: words(entry.rarity),
      type: words(entry.type),
      category,
      appearance: words(entry.appearance),
      description: words(entry.description),
      seaWeakness: words(entry.seaWeakness),
      revealed: granted.revealed,
      features: keys,
      resources: pools,
      parts: [...parts.features, ...parts.spells, ...parts.awakening],
      // A beast's stat block, a line at a time: "Armor Class 12", "Bite. Melee Weapon Attack: …".
      statBlock: (Array.isArray(entry.statBlockLines) ? entry.statBlockLines : []).flatMap((line: unknown) => {
        if (typeof line === 'string') return [line];
        const l = line as { name?: unknown; text?: unknown } | null;
        const name = typeof l?.name === 'string' ? l.name : '';
        const words = typeof l?.text === 'string' ? l.text : '';
        return name || words ? [[name, words].filter(Boolean).join(/^(Armor Class|Hit Points|Speed|Skills|Senses|Languages|Challenge|Saving Throws|STR DEX|Damage|Condition)/.test(name) || !words ? ' ' : '. ')] : [];
      }),
      highestSpellLevel: table?.highestSpellLevel,
    };
  };
  const fruits = heldFruits.map((g, i) => fruitOf(g, true, i));
  const knownFruits = secrets.granted
    .filter((g) => g.kind === 'knowledge' && g.entry.kind === 'devilFruit' && !heldFruits.some((h) => h.key === g.key))
    .map((g) => fruitOf(g, false));
  const fruitSaveDc = fruits.length ? stat(doc, 'fruitSaveDc', 'Devil Fruit save DC', devilFruitSaveDc(wp.value)) : null;
  const fruitAttack = fruits.length ? stat(doc, 'fruitAttack', 'Devil Fruit attack', devilFruitAttackBonus(wp.value)) : null;

  // Haki by Color. A count can be overridden, because Haki from a class or subclass counts toward tiers too.
  const hakiColors: Sheet['haki']['colors'] = HAKI_COLORS.map((color) => {
    const ofColor = haki.filter((h) => h.entry.color === color.id);
    const counted = ofColor.filter((h) => h.entry.amateur !== true);
    const count = stat(doc, `hakiCount.${color.id}`, `${color.name} features`, {
      value: counted.length,
      lines: counted.length ? counted.map((h) => ({ label: h.entry.name, value: 1 })) : [{ label: 'None yet', value: 0 }],
      page: 221,
    });
    const tier = count.value >= 6 ? 3 : count.value >= 4 ? 2 : hakiTier(ofColor.map((h) => ({ rarity: String(h.entry.rarity ?? '') })));
    return { id: color.id, name: color.name, count, tier, features: ofColor.map((h) => h.entry.id) };
  });
  const surgeLog: Sheet['haki']['surges'] = surgeRecords.flatMap((record) => {
    const entry = rules.get(record.entry);
    if (!entry) return [];
    const shown = haki.find((h) => h.record === record);
    return [{ record, name: entry.name, kind: entry.kind, rarity: String(entry.rarity ?? ''), page: entry.source.page, book: entry.source.book, feature: entry.kind === 'hakiFeature' ? shown?.entry.id : `surge/${record.id}` }];
  });

  const formulas: Sheet['formulas'] = sources.flatMap((source) =>
    Object.entries((source.entry.formulas ?? {}) as Record<string, { label: string; expr: string; page?: number }>).map(([id, formula]) => ({
      ...stat(doc, `formula.${id}`, formula.label, { ...explain(formula.expr, scopeFor(source)), page: formula.page ?? source.entry.source.page }),
      from: source.entry.name,
    })),
  );

  const classTable: Sheet['classTable'] = [];
  for (const source of sources) {
    if (source.entry !== source.cls) continue;
    for (const [key, value] of Object.entries(classColumns(source.cls, source.classLevel))) {
      if (/^slots\d$/.test(key) || value === '—') continue;
      classTable.push({ key, label: columnLabel(key), value, from: source.cls.name });
    }
  }

  // Spells: what is known, with the handbook's words for the ones it prints, and what they can be cast with now.
  const slots = resources.filter((r) => /^slots\d$/.test(r.id)).sort((a, b) => a.id.localeCompare(b.id));
  // Each casting class on its own: "You determine what spells you know and can prepare for each class
  // individually, as if you were a single-classed member of that class."
  const castingClasses: SheetSpells['classes'] = sources.filter((source) => source.entry === source.cls).flatMap((source) => {
    const cls = source.cls;
    const columns = classColumns(cls, source.classLevel);
    const own = Object.entries((cls.formulas ?? {}) as Record<string, unknown>);
    const formulaOf = (suffix: RegExp) => {
      const id = own.map(([key]) => key).find((key) => suffix.test(key));
      return id ? formulas.find((f) => f.key === `formula.${id}` && f.from === cls.name) : undefined;
    };
    const number = (key: string | undefined) => (key && typeof columns[key] === 'number' ? (columns[key] as number) : undefined);
    const knownColumn = Object.keys(columns).find((key) => /^(powers|spells|tactics)Known$/.test(key));
    const hasSlots = Object.keys(columns).some((key) => /^slots\d$/.test(key));
    const dc = formulaOf(/DC$/);
    if (!('cantripsKnown' in columns) && !knownColumn && !hasSlots) return [];
    if (!dc && !knownColumn && !('cantripsKnown' in columns)) return [];
    // A class that prepares says how many in its Spellcasting feature; one that learns has a "known" column.
    const preparedText = features.flatMap((f) => (f.key.startsWith(`${cls.id}/`) ? f.displays.filter((d) => /prepared/i.test(d.label)) : []))[0]?.value;
    const preparedMax = preparedText !== undefined && Number.isFinite(Number(preparedText)) ? Number(preparedText) : undefined;
    const slotLevels = Object.keys(columns).flatMap((key) => (/^slots\d$/.test(key) && Number(columns[key]) > 0 ? [Number(key.slice(5))] : []));
    const named = /^(\d)/.exec(String(columns.highestSpellLevel ?? ''));
    return [{
      id: cls.id, name: cls.name, level: source.classLevel,
      mode: preparedMax !== undefined ? 'prepared' as const : 'known' as const,
      dc, attack: formulaOf(/Attack$/),
      cantripsMax: number('cantripsKnown'), knownMax: number(knownColumn), preparedMax,
      maxSpellLevel: slotLevels.length ? Math.max(...slotLevels) : named ? Number(named[1]) : undefined,
      cantrips: 0, known: 0, prepared: 0,
      list: rules.has(`spellList.${cls.id.slice('class.'.length)}`) ? `spellList.${cls.id.slice('class.'.length)}` : undefined,
    }];
  });
  // The names on each casting class's own list, to tell a spell the class was given by override.
  const listNames = new Map(castingClasses.map((c) => [c.id, new Set(Object.values(((c.list ? rules.get(c.list)?.levels : undefined) ?? {}) as Record<string, string[]>).flat().map(spellKey))]));
  /** The class a spell counts for: the one chosen, else the one whose list it was picked from, else the only one there is. */
  const classOf = (spell: { cls?: string; list?: string }) =>
    castingClasses.find((c) => c.id === spell.cls) ?? castingClasses.find((c) => c.list !== undefined && c.list === spell.list) ?? (castingClasses.length === 1 ? castingClasses[0] : undefined);
  const knownSpells: SheetSpells['known'] = (doc.spells ?? []).map((spell) => {
    const entry = spell.entry ? rules.get(spell.entry) : undefined;
    // A spell the player wrote carries its own words; otherwise they come from the rules data, when it has them.
    const own = spell.own && typeof spell.own === 'object' ? spell.own : undefined;
    const words = own ? (typeof own.text === 'string' ? own.text : '') : entry?.kind === 'spell' ? String(entry.text ?? '') : undefined;
    const field = (key: 'school' | 'castingTime' | 'range' | 'components' | 'duration') => {
      const value = own ? own[key] : entry?.[key];
      return typeof value === 'string' && value ? value : undefined;
    };
    // A spell an item grants belongs to no class: it is not counted against what a class knows or prepares, and is always ready.
    const of = spell.item ? undefined : classOf(spell);
    if (of) {
      if (spell.level === 0) of.cantrips += 1;
      else { of.known += 1; if (spell.prepared) of.prepared += 1; }
    }
    return {
      ...spell,
      text: words,
      school: field('school'), castingTime: field('castingTime'), range: field('range'), components: field('components'), duration: field('duration'),
      page: own ? undefined : entry?.source.page, book: own ? CUSTOM_SPELL_BOOK : entry?.source.book,
      tables: !own && entry?.kind === 'spell' && Array.isArray(entry.tables) ? (entry.tables as TableDef[]) : undefined,
      ritual: (own ? own.ritual === true : entry?.kind === 'spell' && entry.ritual === true) ? true : undefined,
      rolls: words ? rollButtons(diceInText(words), plainScope) : [],
      castableWith: spell.level > 0 ? slots.filter((r) => Number(r.id.slice(5)) >= spell.level && r.remaining > 0).map((r) => Number(r.id.slice(5))) : [],
      cls: of?.id, clsName: of?.name, mode: of?.mode,
      // A class that learns its spells always has them ready; one that prepares has only today's.
      ready: spell.level === 0 || of?.mode !== 'prepared' || spell.prepared === true,
      tooHigh: spell.level > 0 && of?.maxSpellLevel !== undefined && spell.level > of.maxSpellLevel,
      // Any spell may be given to any class. One that is not on that class's list is marked, so everyone can see it is an override.
      override: Boolean(of?.list) && !listNames.get(of!.id)!.has(spellKey(spell.name)),
    };
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const casting: SheetSpells['casting'] = castingClasses.filter((c) => c.dc || c.attack).map((c) => ({ from: c.name, dc: c.dc, attack: c.attack }));
  const limits: SheetSpells['limits'] = [
    ...classTable.filter((c) => /known$|^highestSpellLevel$/i.test(c.key)).map((c) => ({ label: c.label, value: String(c.value), from: c.from })),
    ...features.flatMap((f) => f.displays.filter((d) => /prepared/i.test(d.label)).map((d) => ({ label: d.label, value: d.value, from: f.from.replace(/ \d+$/, '') }))),
  ];
  const attunedTo = (saved.inventory ?? []).filter((item) => item.attuned === true && item.qty > 0);
  const attunementMax = stat(doc, 'attunement', 'Attunement slots', { value: 3, lines: [{ label: 'A creature can be attuned to no more than three magic items at a time (5e SRD 5.1 p. 206)', value: 3 }] });
  const attunement: Sheet['attunement'] = { used: attunedTo.length, max: attunementMax, over: attunedTo.length > attunementMax.value, items: attunedTo.map((item) => item.name) };
  const spellbook: SheetSpells = {
    casting, slots, limits, known: knownSpells, classes: castingClasses, pooledSlots: pooled.length > 1,
    cantrips: knownSpells.filter((k) => k.level === 0).length,
    leveled: knownSpells.filter((k) => k.level > 0).length,
    prepared: knownSpells.filter((k) => k.level > 0 && k.prepared).length,
  };

  // Bounty: the DM Guide's suggestion. Level, the strongest Haki and a held Devil Fruit are read from the sheet;
  // the deeds are the player's count. A sheet derived without the private content leaves the fruit out.
  const rarest = (rarities: string[]) => rarities.reduce<string | null>((best, r) => ((RARITY_LEVEL[r] ?? 0) > (best ? RARITY_LEVEL[best] ?? 0 : 0) ? r : best), null);
  const bountyStat = stat(doc, 'bounty', 'Bounty', bountyOf({
    level,
    ...(doc.bounty?.deeds ?? {}),
    topHakiRarity: rarest(haki.map((h) => String(h.entry.rarity ?? ''))),
    fruitRarity: rarest(fruits.map((f) => f.rarity)),
  }));

  const hitDie = first?.cls.hitDie ?? 8;
  const dreamMax = dreamPointsMax(level);
  // "Add together the Hit Dice granted by all your classes to form your pool of Hit Dice."
  const dice = new Map<number, number>();
  for (const picked of doc.classes) {
    const die = (rules.get(picked.id) as ClassEntry | undefined)?.hitDie;
    if (die) dice.set(die, (dice.get(die) ?? 0) + picked.level);
  }
  const hitDicePool = [...dice].map(([die, count]) => ({ die, count })).sort((a, b) => b.die - a.die);
  warnings.push(
    ...multiclassWarnings(sources.filter((s) => s.entry === s.cls).map((s) => s.cls.name), doc.scores, rules).map(
      (w) => `${w} (${HANDBOOKS[doc.rulesVersion] === 'DnDF Expanded Handbook v10' ? 'EH10' : 'EH8.8'} p.${GENERAL_PAGES[doc.rulesVersion].multiclassing})`,
    ),
  );

  const classText = doc.classes
    .map((c) => {
      const sub = c.subclass ? rules.get(c.subclass)?.name : undefined;
      return `${rules.get(c.id)?.name ?? c.id} ${c.level}${sub ? ` (${sub})` : ''}`;
    })
    .join(' / ');

  return {
    name: doc.name,
    summary: `${doc.race.name} · ${classText}`,
    level,
    abilities,
    prof,
    saves,
    skills,
    passivePerception,
    initiative,
    ...(edgeOf('initiative', { ability: 'dex' }) ? { initiativeEdge: edgeOf('initiative', { ability: 'dex' }) } : {}),
    ac,
    speed,
    speeds,
    maxHp: maxHpStat,
    carry,
    willpower: wp,
    hakiSaveDc: hakiDc,
    hakiAttack,
    hitDice: { die: hitDie, total: level, remaining: left(level, doc.state.hitDiceSpent), pool: hitDicePool },
    book: HANDBOOKS[doc.rulesVersion],
    dreamPoints: { max: dreamMax, remaining: Math.max(0, dreamMax - doc.state.dreamPointsSpent) },
    prestigeMax: piratePrestigeMax(level),
    healingSurgeDice: healingSurgeMaxDice(level, Math.max(0, level - doc.state.hitDiceSpent)),
    specialReactionReduction: specialReactionReduction(level).text,
    attacksPerAction: Math.max(1, ...ofType('attacksPerAction').map((e) => amount(e))),
    formulas,
    classTable,
    specialReactions,
    generalRules,
    resources,
    toggles,
    trackers,
    takenOff: offSheet,
    proficiencies,
    counters,
    attacks,
    features,
    notes,
    haki: {
      colors: hakiColors,
      purist: { earned: hakiPuristPicks(level, heldFruits.length > 0, doc.rulesVersion), levels: HAKI_PURIST_LEVELS[doc.rulesVersion], picks: doc.hakiPurist ?? [] },
      surges: surgeLog,
    },
    gear: inventory,
    money: doc.money ?? 0,
    wanted: bountyStat,
    poster: doc.bounty?.posted ?? null,
    spellbook,
    attunement,
    conditions,
    protections: defenses,
    raceChoices: racePicks,
    racePicks: chosen,
    fruits,
    knownFruits,
    fruitSaveDc,
    fruitAttack,
    warnings,
  };
}

/**
 * How a d20 is rolled once what the sheet says is put together with what the player chose for this roll.
 * Advantage and disadvantage from any two sources cancel to a straight roll.
 */
export function rollModeWith(edge: RollEdge | undefined, chosen: RollMode = 'normal'): RollMode {
  const up = chosen === 'advantage' || Boolean(edge?.reasons.some((r) => r.mode === 'advantage'));
  const down = chosen === 'disadvantage' || Boolean(edge?.reasons.some((r) => r.mode === 'disadvantage'));
  return up && down ? 'normal' : up ? 'advantage' : down ? 'disadvantage' : 'normal';
}

/** "disadvantage: Chain Mail" / "advantage: Cloak; disadvantage: Chain Mail, so a straight roll". */
export function describeEdge(edge: RollEdge): string {
  const list = (mode: 'advantage' | 'disadvantage') => [...new Set(edge.reasons.filter((r) => r.mode === mode).map((r) => r.from))].join(', ');
  const parts = (['advantage', 'disadvantage'] as const).filter((mode) => list(mode)).map((mode) => `${mode}: ${list(mode)}`);
  return edge.mode === 'normal' ? `${parts.join('; ')}, so a straight roll` : parts.join('; ');
}

/** The advantage or disadvantage that goes with one of the sheet's numbers, by its key ("skill.stealth", "save.wis", "initiative", "attack.<id>"). */
export function edgeForStat(sheet: Sheet, key: string): RollEdge | undefined {
  if (key === 'initiative') return sheet.initiativeEdge;
  if (key.startsWith('skill.')) return sheet.skills.find((s) => s.key === key)?.edge;
  if (key.startsWith('save.')) return Object.values(sheet.saves).find((s) => s.key === key)?.edge;
  if (key.startsWith('attack.')) return sheet.attacks.find((a) => a.toHit.key === key)?.edge;
  return undefined;
}
