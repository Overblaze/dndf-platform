// Racial traits that are a list to pick from (Cyborg Upgrades, a Mink's Animal Characteristics).
import type { CharacterDoc } from './character';
import { evaluateNumber } from './expr';
import { SKILLS } from './character';
import type { OptionDef, PickDef, RuleEntry, TraitDef } from './types';

export interface RaceChoice {
  /** The key in `doc.choices`. */
  id: string;
  /** The trait's name. */
  name: string;
  /** The race or subrace it belongs to. */
  from: string;
  /** How many the rules give at this level. */
  allowed: number;
  picked: string[];
  group: RuleEntry;
  options: (OptionDef & { requires?: string })[];
  page: number;
  book: string;
}

/** The pick-lists of the character's race and subrace, with how many may be picked at a level (the character's own unless given). */
export function raceChoices(doc: Pick<CharacterDoc, 'race' | 'classes' | 'choices'>, rules: Map<string, RuleEntry>, atLevel?: number): RaceChoice[] {
  const level = Math.max(1, atLevel ?? doc.classes.reduce((total, c) => total + c.level, 0));
  const found: RaceChoice[] = [];
  for (const id of [doc.race.id, doc.race.subraceId]) {
    const entry = id ? rules.get(id) : undefined;
    for (const trait of (entry?.traits ?? []) as TraitDef[]) {
      const choices = (trait as TraitDef & { choices?: { id: string; count: number | string; from: string } }).choices;
      const group = choices ? rules.get(choices.from) : undefined;
      if (!choices || !group) continue;
      found.push({
        id: choices.id, name: trait.name, from: entry!.name, allowed: evaluateNumber(choices.count, { level }),
        picked: doc.choices?.[choices.id] ?? [], group, options: (group.options ?? []) as RaceChoice['options'], page: trait.page, book: entry!.source.book,
      });
    }
  }
  return found;
}

/** A choice a racial trait or a picked option leaves to the player: which skill, which tool, which weapon. */
export interface RacePick {
  /** The key in `doc.choices`. */
  key: string;
  /** The trait or option that gives it: "Shape-Memory Alloy Body". */
  from: string;
  /** The race, class or background it belongs to. */
  race: string;
  def: PickDef;
  /** What is picked: skill ids, or names of tools and weapons. A tool picked where a skill could be is "tool:<name>". */
  picked: string[];
  page: number;
  book: string;
}

const slugOf = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** The key a pick's values are kept under. */
export function racePickKey(owner: string, pickId: string): string {
  return `pick.${owner}.${pickId}`;
}

/**
 * Every such choice the character has now: those of the race's and subrace's traits, and those of the options
 * picked from its lists (a Cyborg's Shape-Memory Alloy Body). One whose option is no longer picked is not listed.
 */
export function racePicks(doc: Pick<CharacterDoc, 'race' | 'classes' | 'choices'> & Partial<Pick<CharacterDoc, 'background'>>, rules: Map<string, RuleEntry>): RacePick[] {
  const found: RacePick[] = [];
  const add = (owner: string, from: string, race: string, picks: PickDef[] | undefined, page: number, book: string) => {
    for (const def of picks ?? []) {
      const key = racePickKey(owner, def.id);
      found.push({ key, from, race, def, picked: (doc.choices?.[key] ?? []).filter((v) => typeof v === 'string' && v.trim() !== ''), page, book });
    }
  };
  for (const id of [doc.race.id, doc.race.subraceId]) {
    const entry = id ? rules.get(id) : undefined;
    for (const trait of (entry?.traits ?? []) as TraitDef[]) add(`${entry!.id}.${slugOf(trait.name)}`, trait.name, entry!.name, trait.picks, trait.page, entry!.source.book);
  }
  for (const choice of raceChoices(doc, rules)) {
    for (const option of choice.options) {
      if (choice.picked.includes(option.id)) add(`${choice.id}.${option.id}`, option.name, choice.from, option.picks as PickDef[] | undefined, option.page, choice.book);
    }
  }
  // The tools a class or a background leaves to choose ("two types of artisan’s tools of your choice").
  const seen = new Set<string>();
  for (const held of doc.classes) {
    const cls = rules.get(held.id);
    const picks = (cls?.proficiencies as { toolPicks?: PickDef[] } | undefined)?.toolPicks;
    if (cls && picks && !seen.has(cls.id)) add(cls.id, 'Tools', cls.name, picks, cls.source.page, cls.source.book);
    seen.add(held.id);
  }
  const background = doc.background ? rules.get(doc.background.id) : undefined;
  if (background) add(background.id, 'Tools', `${background.name} background`, (background.tools as { picks?: PickDef[] } | undefined)?.picks, background.source.page, background.source.book);
  return found;
}

/** What a pick's value is called on the sheet: "Stealth", "Thieves’ Tools". */
export function racePickLabel(pick: RacePick, value: string): string {
  if (value.startsWith('tool:')) return value.slice(5);
  return pick.def.kind === 'skill' ? SKILLS.find((k) => k.id === value)?.name ?? value : value;
}

/** What the player may pick from, when the trait limits it; undefined for anything of the kind. */
export function racePickOptions(pick: RacePick): { id: string; name: string }[] | undefined {
  if (pick.def.kind !== 'skill') return pick.def.from?.map((name) => ({ id: name, name }));
  const ids = pick.def.from ?? SKILLS.map((k) => k.id);
  return ids.map((id) => ({ id, name: SKILLS.find((k) => k.id === id)?.name ?? id }));
}
