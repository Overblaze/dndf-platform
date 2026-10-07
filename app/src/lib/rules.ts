import { armorFromItem, indexRules, weaponFromItem, type ClassEntry, type FeatureDef, type OptionDef, type Rng, type RuleEntry, type RulesFile, type RulesVersion } from '@dndf/engine';

// Every public rules file under data/rules, bundled with the site.
const files = Object.values(import.meta.glob<RulesFile>('../../../data/rules/*/*.json', { eager: true, import: 'default' }));

export const VERSION_NAMES: Record<RulesVersion, string> = { 'dndf-10': 'Rules v10', 'dndf-8.8': 'Rules v8.8' };

/** One handbook's worth of rules: everything a character pinned to that version can use. */
export interface RuleSet {
  version: RulesVersion;
  rules: Map<string, RuleEntry>;
  classes: ClassEntry[];
  races: RuleEntry[];
  backgrounds: RuleEntry[];
  crewRoles: RuleEntry[];
  feats: RuleEntry[];
  generalRules: RuleEntry[];
  /** Armory entries that can be worn or wielded. */
  armors: RuleEntry[];
  weapons: RuleEntry[];
  surgeAdvancements: RuleEntry[];
  hakiFeatures: RuleEntry[];
  spellLists: RuleEntry[];
  spells: RuleEntry[];
  subclassesOf: (classId: string) => RuleEntry[];
  /** The subclasses a class's main choice picks from (Tinkerer Professions are a second, separate choice). */
  mainSubclasses: (classId: string) => RuleEntry[];
  subracesOf: (raceId: string) => RuleEntry[];
  optionGroupsOf: (classKey: string) => RuleEntry[];
  /** Features of a class that ask the player to pick options from a list (Fury features, Emanations). */
  choiceFeatures: (cls: ClassEntry, subclassId?: string) => (FeatureDef & { choices: NonNullable<FeatureDef['choices']>; options: OptionDef[]; from: string })[];
}

function build(version: RulesVersion): RuleSet {
  const rules = indexRules(files, version);
  const all = [...rules.values()];
  const byName = (a: RuleEntry, b: RuleEntry) => a.name.localeCompare(b.name);
  const subclassesOf = (classId: string) => all.filter((e) => e.kind === 'subclass' && e.parent === classId);
  return {
    version,
    rules,
    classes: all.filter((e): e is ClassEntry => e.kind === 'class').sort(byName),
    races: all.filter((e) => e.kind === 'race'),
    backgrounds: all.filter((e) => e.kind === 'background').sort(byName),
    crewRoles: all.filter((e) => e.kind === 'crewRole'),
    feats: all.filter((e) => e.kind === 'feat').sort(byName),
    generalRules: all.filter((e) => e.kind === 'rule'),
    armors: all.filter((e) => e.kind === 'item' && armorFromItem(e) !== null),
    weapons: all.filter((e) => e.kind === 'item' && weaponFromItem(e) !== null),
    surgeAdvancements: all.filter((e) => e.kind === 'surgeAdvancement'),
    hakiFeatures: all.filter((e) => e.kind === 'hakiFeature'),
    spellLists: all.filter((e) => e.kind === 'spellList'),
    spells: all.filter((e) => e.kind === 'spell').sort((a, b) => Number(a.level ?? 0) - Number(b.level ?? 0)),
    subclassesOf,
    mainSubclasses(classId) {
      const subs = subclassesOf(classId);
      return subs.filter((s) => s.group === subs[0]?.group);
    },
    subracesOf: (raceId) => all.filter((e) => e.kind === 'subrace' && e.parent === raceId),
    optionGroupsOf: (classKey) => all.filter((e) => e.kind === 'optionGroup' && e.id.startsWith(`optionGroup.${classKey}_`)),
    choiceFeatures: (cls, subclassId) => {
      const sub = subclassId ? rules.get(subclassId) : undefined;
      return [cls, ...(sub?.kind === 'subclass' ? [sub] : [])].flatMap((entry) =>
        ((entry.features ?? []) as FeatureDef[]).flatMap((feature) => {
          if (!feature.choices) return [];
          return [{ ...feature, choices: feature.choices, options: (rules.get(feature.choices.from)?.options ?? []) as OptionDef[], from: entry.name }];
        }),
      );
    },
  };
}

const sets = new Map<RulesVersion, RuleSet>();

/** The rules for one version, built on first use. */
export function ruleSet(version: RulesVersion): RuleSet {
  let set = sets.get(version);
  if (!set) {
    set = build(version);
    sets.set(version, set);
  }
  return set;
}

/** Dice use the browser's cryptographic random source. */
export const rng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
