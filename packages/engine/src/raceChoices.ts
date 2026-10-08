// Racial traits that are a list to pick from (Cyborg Upgrades, a Mink's Animal Characteristics).
import type { CharacterDoc } from './character';
import { evaluateNumber } from './expr';
import type { OptionDef, RuleEntry, TraitDef } from './types';

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
