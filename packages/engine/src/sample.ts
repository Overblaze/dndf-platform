// Starting points: a blank Bruiser, and Kaito, the sample character of docs/FORMULAS.md.
import { freshState, type CharacterDoc } from './character';
import { deriveSheet } from './sheet';
import type { AbilityScores, RuleEntry } from './types';

export interface NewBruiserInput {
  name: string;
  level: number;
  scores: AbilityScores;
  raceName?: string;
  speed?: number;
  subclass?: string;
  skills?: string[];
  furyFeatures?: string[];
}

/** A v10 Bruiser at any level, at full hit points with nothing spent. */
export function newBruiser(input: NewBruiserInput, rules: Map<string, RuleEntry>): CharacterDoc {
  const doc: CharacterDoc = {
    schema: 1,
    name: input.name,
    rulesVersion: 'dndf-10',
    race: { name: input.raceName ?? 'Human (Standard)', speed: input.speed ?? 30 },
    classes: [{ id: 'class.bruiser', level: input.level, subclass: input.level >= 3 ? input.subclass : undefined }],
    scores: input.scores,
    skills: input.skills ?? [],
    expertise: [],
    choices: { furyFeatures: input.level >= 2 ? input.furyFeatures ?? [] : [] },
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
