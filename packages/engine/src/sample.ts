// Starting points: a blank character of any class, and Kaito, the sample character of docs/FORMULAS.md.
import { freshState, type CharacterDoc } from './character';
import { deriveSheet } from './sheet';
import type { AbilityScores, ClassEntry, RuleEntry, RulesVersion } from './types';

export interface NewCharacterInput {
  name: string;
  /** Which handbook the character is built from; the rules passed in must be that version's. */
  rulesVersion?: RulesVersion;
  /** Class entry id; defaults to the Bruiser. */
  classId?: string;
  level: number;
  scores: AbilityScores;
  raceName?: string;
  speed?: number;
  /** Race and subrace entry ids, when picked from the book. */
  raceId?: string;
  subraceId?: string;
  backgroundId?: string;
  crewRoleId?: string;
  feats?: string[];
  subclass?: string;
  skills?: string[];
  /** Picks from option groups, by choice id. */
  choices?: Record<string, string[]>;
  /** Shorthand for choices.furyFeatures. */
  furyFeatures?: string[];
}

/** A character of any class and level, at full hit points with nothing spent. */
export function newCharacter(input: NewCharacterInput, rules: Map<string, RuleEntry>): CharacterDoc {
  const classId = input.classId ?? 'class.bruiser';
  const cls = rules.get(classId) as ClassEntry | undefined;
  const subclassLevel = cls?.subclass?.level ?? 3;
  const choices = { ...input.choices };
  if (input.furyFeatures && input.level >= 2) choices.furyFeatures = input.furyFeatures;
  const doc: CharacterDoc = {
    schema: 1,
    name: input.name,
    rulesVersion: input.rulesVersion ?? 'dndf-10',
    race: { id: input.raceId, subraceId: input.subraceId, name: input.raceName ?? 'Human (Standard)', speed: input.speed ?? 30 },
    background: input.backgroundId ? { id: input.backgroundId } : undefined,
    crewRole: input.crewRoleId ? { id: input.crewRoleId } : undefined,
    feats: input.feats,
    classes: [{ id: classId, level: input.level, subclass: input.level >= subclassLevel ? input.subclass : undefined }],
    scores: input.scores,
    skills: input.skills ?? [],
    expertise: [],
    choices,
    armor: null,
    shield: false,
    weapons: [],
    willpower: { strengthenSelf: 0 },
    overrides: {},
    state: freshState(0),
    notes: '',
  };
  doc.state = freshState(deriveSheet(doc, rules).maxHp.value);
  return doc;
}

/** A v10 Bruiser: the class the sheet was first built on. */
export const newBruiser = newCharacter;

/** Kaito Rourke, Human (Standard) Bruiser 7: every "Kaito" value in docs/FORMULAS.md comes from this. */
export function kaito(rules: Map<string, RuleEntry>): CharacterDoc {
  const doc = newBruiser(
    {
      name: 'Kaito Rourke',
      level: 7,
      scores: { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 },
      subclass: 'subclass.bruiser.black_fist',
      skills: ['athletics', 'intimidation', 'perception'],
      furyFeatures: ['brace_for_impact', 'keep_going', 'brute_force'],
    },
    rules,
  );
  doc.weapons = [{ id: 'club', name: 'Club', damage: '1d4', damageType: 'bludgeoning', category: 'simple' }];
  return doc;
}
