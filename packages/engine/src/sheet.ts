// Turns a saved character + the rules data into every number on the sheet, each with
// its line-by-line breakdown. The website and the Discord bot both call this.
import { CUSTOM_BOOK, customFeatureDef, rulesFor } from './customClass';
import { DEFAULT_SETTINGS, SKILLS, crewRolesOf, type CampaignSettings, type CharacterDoc, type WeaponDef } from './character';
import { GENERAL_PAGES, HANDBOOKS } from './citations';
import { classColumns } from './classes';
import { abilityMod, maxHp, proficiencyBonus } from './core';
import { fillTemplate, formatDice, parseDice, type DiceSpec } from './dice';
import { COMBINED_CASTERS, multiclassSlots, multiclassWarnings } from './multiclass';
import { hakiAttackBonus, hakiSaveDc, willpower } from './dndf';
import { evaluate, evaluateNumber, explain, type ExprScope } from './expr';
import { dreamPointsMax, healingSurgeMaxDice, piratePrestigeMax, specialReactionReduction, specialReactionUses } from './general';
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

export interface SheetAttack {
  id: string;
  name: string;
  toHit: Stat;
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
  abilities: Record<Ability, { score: number; mod: number }>;
  prof: Stat;
  saves: Record<Ability, Stat & { proficient: boolean }>;
  skills: SheetSkill[];
  passivePerception: Stat;
  initiative: Stat;
  ac: Stat;
  speed: Stat;
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

export function deriveSheet(doc: CharacterDoc, handbook: Map<string, RuleEntry>, settings: CampaignSettings = DEFAULT_SETTINGS): Sheet {
  // The handbook's rules, plus any classes the player wrote for this character.
  const rules = rulesFor(doc, handbook);
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

  // 2. Ability scores, after features that raise them (The King).
  const scores: AbilityScores = { ...doc.scores };
  for (const { def } of active) {
    for (const effect of (def.effects ?? []) as EffectDef[]) {
      if (effect.type !== 'ability' || !effect.ability) continue;
      const raised = scores[effect.ability] + (effect.value ?? 0);
      scores[effect.ability] = Math.max(scores[effect.ability], Math.min(raised, effect.max ?? raised));
    }
  }
  const abilities = {} as Sheet['abilities'];
  const mod: Record<string, number> = {};
  for (const a of ABILITIES) {
    abilities[a] = { score: scores[a], mod: abilityMod(scores[a]) };
    mod[a] = abilities[a].mod;
  }

  const prof = stat(doc, 'prof', 'Proficiency bonus', {
    value: proficiencyBonus(level),
    lines: [{ label: 'Base', value: 2 }, { label: `Level ${level}: (level − 1) ÷ 4, rounded down`, value: Math.floor((level - 1) / 4) }],
    page: GENERAL_PAGES[doc.rulesVersion].proficiency,
  });

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
    mod,
    col: classColumns(source.cls, source.classLevel),
    on,
    tracker,
    noArmor: doc.armor === null,
    noShield: !doc.shield,
    wearingArmor: doc.armor !== null,
    // Heavy armor is the kind that adds no Dexterity.
    heavyArmor: doc.armor?.dexCap === 0,
    bruiserWeapon: false,
    melee: false,
    ranged: false,
    twoHanded: false,
    weapon: '',
    ...extra,
  });

  // Features that don't come from a class (race, background, crew role, feats) see the whole character's level.
  const plainScope: ExprScope = {
    level, prof: prof.value, mod, on, tracker, noArmor: doc.armor === null, noShield: !doc.shield, wearingArmor: doc.armor !== null,
    heavyArmor: doc.armor?.dexCap === 0, bruiserWeapon: false, melee: false, ranged: false, twoHanded: false, weapon: '',
  };

  // The character's race, background, crew role and feats, from the rules data.
  const race = doc.race.id ? rules.get(doc.race.id) : undefined;
  const subrace = doc.race.subraceId ? rules.get(doc.race.subraceId) : undefined;
  if (doc.race.id && !race) warnings.push(`Race "${doc.race.id}" is not in the rules data.`);
  const racialTraits = [race, subrace].flatMap((r) => ((r?.traits ?? []) as TraitDef[]).map((trait) => ({ trait, entry: r! })));
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
  // Armor worn or a shield carried without the proficiency: said plainly, never blocked.
  const armorKind = doc.armor ? (doc.armor.dexCap === 0 ? 'heavy' : doc.armor.dexCap == null ? 'light' : 'medium') : undefined;
  const unproficient = 'disadvantage on Strength and Dexterity checks, saves and attack rolls, and you can’t cast spells';
  if (doc.armor && !(doc.armor.proficient ?? proficiencies.armor.some((p) => p.id === armorKind))) notes.push({ label: `Not proficient with ${armorKind} armor: ${unproficient}`, from: doc.armor.name });
  if (doc.shield && !proficiencies.armor.some((p) => p.id === 'shields')) notes.push({ label: `Not proficient with shields: ${unproficient}`, from: 'Shield' });

  const exhaustion = doc.state.exhaustion;
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

  const saves = {} as Sheet['saves'];
  for (const a of ABILITIES) {
    const lines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[a]} modifier`, value: mod[a]! }];
    if (saveProfs.has(a)) lines.push({ label: 'Proficiency bonus', value: prof.value });
    saves[a] = { ...stat(doc, `save.${a}`, `${ABILITY_NAMES[a]} save`, { value: sum(lines), lines }), proficient: saveProfs.has(a) };
  }

  // Jack of All Trades: half proficiency on ability checks that don't already include it.
  const halfProf = ofType('halfProficiency').slice(0, 1);
  const skills: SheetSkill[] = SKILLS.map((skill) => {
    const proficient = skillProfs.has(skill.id);
    const expertise = proficient && expertiseIn.has(skill.id);
    const lines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[skill.ability]} modifier`, value: mod[skill.ability]! }];
    if (proficient) lines.push({ label: expertise ? 'Proficiency bonus × 2 (expertise)' : 'Proficiency bonus', value: prof.value * (expertise ? 2 : 1) });
    else for (const e of halfProf) lines.push({ label: `${e.from}: half proficiency, rounded down`, value: Math.floor(prof.value / 2) });
    return { ...stat(doc, `skill.${skill.id}`, skill.name, { value: sum(lines), lines }), id: skill.id, ability: skill.ability, proficient, expertise };
  });
  const perception = skills.find((s) => s.id === 'perception')!;
  const passivePerception = stat(doc, 'passivePerception', 'Passive Perception', {
    value: 10 + perception.value,
    lines: [{ label: 'Base', value: 10 }, { label: 'Perception', value: perception.value }],
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
  const ac = stat(doc, 'ac', 'Armor Class', { value: sum(acLines), lines: acLines, page: bestAc.page });

  // 6. Speed, initiative, hit points, carrying.
  const speedLines: BreakdownLine[] = [{ label: doc.race.name, value: doc.race.speed }, ...bonusLines('speed')];
  if (exhaustion >= 5) speedLines.push({ label: `Exhaustion ${exhaustion}: speed 0`, value: -sum(speedLines) });
  else if (exhaustion >= 2) speedLines.push({ label: `Exhaustion ${exhaustion}: speed halved`, value: -Math.ceil(sum(speedLines) / 2) });
  const speed = stat(doc, 'speed', 'Speed', { value: sum(speedLines), lines: speedLines });

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

  // 7. Willpower and Haki.
  const variant = doc.willpower.variantAdvancements;
  const wp = stat(doc, 'willpower', 'Willpower', willpower({
    level,
    strengthenSelf: doc.willpower.strengthenSelf,
    variant: typeof variant === 'number' ? { spiritualAdvancements: variant } : undefined,
  }));
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
      const id = a.key.startsWith('custom/') || a.key.startsWith('class.custom.') ? `use.${a.key}` : `use.${slug(a.def.name)}`;
      featureResource.set(a.key, id);
      resourceDefs.push({ def: { id, name: a.def.name, max: uses.max, recharge: uses.recharge }, source: a.source, page: a.def.page });
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
    general(`sr.${id}`, r.name, specialReactionUses(prof.value));
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
    const dice = useStyle ? style.dice : weapon.damage;
    const damageLines: BreakdownLine[] = [
      { label: useStyle ? `${style.from} die` : 'Weapon die', value: dice },
      { label: `${ABILITY_NAMES[ability]} modifier`, value: mod[ability]! },
    ];
    if (weapon.bonus) damageLines.push({ label: 'Item bonus', value: weapon.bonus });
    damageLines.push(...bonusLines('damage', extra).filter((l) => l.value !== 0));
    // Damage typed by hand may not be dice at all. Show it as typed and say so; the attack still rolls to hit.
    const spec = readDice(dice);
    const flat = damageLines.slice(1).reduce((total, l) => total + Number(l.value), 0);
    if (spec) spec.bonus += flat;
    else attackNotes.push(`Can't read "${String(dice).slice(0, 20)}" as dice: fix the weapon's damage in Edit`);

    return {
      id: weapon.id,
      name: weapon.name,
      toHit: stat(doc, `attack.${weapon.id}`, `${weapon.name} attack`, { value: sum(hitLines), lines: hitLines }),
      damage: spec ? formatDice(spec) : String(flat),
      damageType: weapon.damageType,
      damageLines,
      notes: attackNotes,
    };
  });

  // 11. Features, with their dice and display values worked out.
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
      rolls: rollButtons((def.rolls ?? []) as RollDef[], scope),
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
  for (const { trait, entry } of racialTraits) {
    // Descriptive traits stay in the Library; the sheet lists the ones a player uses.
    if (/^(age|alignment|size|speed|ability score increase|subrace)$/i.test(trait.name)) continue;
    extra(`${entry.id}/${slug(trait.name)}`, trait.name, trait.text, trait.page, entry, entry.kind === 'subrace' ? `${race?.name ?? ''} (${entry.name})` : entry.name, { tables: trait.tables ?? [] });
  }
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
    ac,
    speed,
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
    warnings,
  };
}
