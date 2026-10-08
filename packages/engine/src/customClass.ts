// A class the player wrote: its own hit die, saving throws, proficiencies and features by level.
// It is turned into the same shape as a class from the handbook, so the sheet, level-up and
// multiclassing treat it like any other.
import type { CharacterDoc, CustomFeature } from './character';
import type { Ability, ClassEntry, EffectDef, FeatureDef, RuleEntry, RulesVersion } from './types';

/** The "book" of anything the player wrote. */
export const CUSTOM_BOOK = 'Custom';

export interface CustomClassFeature extends CustomFeature {
  /** The class level it arrives at. */
  level: number;
}

export interface CustomClass {
  /** Unique within the character; the class's rules id is `class.custom.<id>`. */
  id: string;
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  savingThrows: Ability[];
  /** "light", "medium", "heavy", "shields". */
  armor: string[];
  /** "simple", "martial", or a weapon's name. */
  weapons: string[];
  tools: string[];
  /** Class levels that give an Ability Score Improvement. */
  asiLevels: number[];
  features: CustomClassFeature[];
}

export const customClassId = (id: string) => `class.custom.${id}`;
export const isCustomClassId = (id: string) => id.startsWith('class.custom.');
export const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19];

/** A player's feature as the engine reads features. `toggleId` keeps its switch apart from every other. */
export function customFeatureDef(custom: CustomFeature, level: number, toggleId: string): FeatureDef {
  const effects: EffectDef[] = [
    ...(custom.bonuses ?? []).filter((b) => b.value).map((b) => ({ type: b.type, value: b.value })),
    ...(custom.note ? [{ type: 'note', label: custom.note }] : []),
  ];
  return {
    level, name: custom.name || 'Custom feature', text: custom.text, page: 0,
    ...(custom.action ? { action: custom.action } : {}),
    ...(custom.uses && custom.uses.max > 0 ? { uses: custom.uses } : {}),
    ...(custom.rolls?.length ? { rolls: custom.rolls } : {}),
    ...(custom.switched && effects.length ? { toggle: { id: toggleId, label: custom.name, effects } } : effects.length ? { effects } : {}),
  };
}

export function customClassEntry(custom: CustomClass, version: RulesVersion): ClassEntry {
  const levels = [...custom.features].sort((a, b) => a.level - b.level);
  return {
    id: customClassId(custom.id),
    kind: 'class',
    name: custom.name.trim() || 'Custom class',
    versions: [version],
    source: { book: CUSTOM_BOOK, page: 0 },
    hitDie: custom.hitDie,
    savingThrows: custom.savingThrows,
    proficiencies: { armor: custom.armor.map((a) => (a === 'shields' ? a : `${a}_armor`)), weapons: custom.weapons, tools: custom.tools },
    asiLevels: custom.asiLevels,
    features: levels.map((f) => ({ ...customFeatureDef(f, Math.max(1, Math.min(20, Math.round(f.level) || 1)), `custom.${custom.id}.${f.id}`), customId: f.id })),
    custom: true,
  };
}

/** The rules a character is read against: the handbook's, plus any classes the player wrote for it. */
export function rulesFor(doc: Pick<CharacterDoc, 'customClasses' | 'rulesVersion'>, rules: Map<string, RuleEntry>): Map<string, RuleEntry> {
  const customs = doc.customClasses ?? [];
  if (customs.length === 0) return rules;
  const view = new Map(rules);
  for (const custom of customs) view.set(customClassId(custom.id), customClassEntry(custom, doc.rulesVersion));
  return view;
}
