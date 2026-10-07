import { indexRules, type ClassEntry, type FeatureDef, type OptionDef, type Rng, type RuleEntry, type RulesFile } from '@dndf/engine';

// Every public rules file under data/rules, bundled with the site.
const files = import.meta.glob<RulesFile>('../../../data/rules/dndf-10/*.json', { eager: true, import: 'default' });

/** Every public rules entry the app knows, by id. */
export const rules = indexRules(Object.values(files));

const all = [...rules.values()];
export const classes = all.filter((e): e is ClassEntry => e.kind === 'class').sort((a, b) => a.name.localeCompare(b.name));
export const subclassesOf = (classId: string): RuleEntry[] => all.filter((e) => e.kind === 'subclass' && e.parent === classId);
export const optionGroupsOf = (classKey: string): RuleEntry[] => all.filter((e) => e.kind === 'optionGroup' && e.id.startsWith(`optionGroup.${classKey}_`));

/** The subclasses a class's main choice picks from (Tinkerer Professions are a second, separate choice). */
export function mainSubclasses(classId: string): RuleEntry[] {
  const subs = subclassesOf(classId);
  const group = subs[0]?.group;
  return subs.filter((s) => s.group === group);
}

/** Features of a class that ask the player to pick options from a list (Fury features). */
export function choiceFeatures(cls: ClassEntry): (FeatureDef & { choices: NonNullable<FeatureDef['choices']>; options: OptionDef[] })[] {
  return cls.features.flatMap((feature) => {
    if (!feature.choices) return [];
    const options = (rules.get(feature.choices.from)?.options ?? []) as OptionDef[];
    return [{ ...feature, choices: feature.choices, options }];
  });
}

/** Dice use the browser's cryptographic random source. */
export const rng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
