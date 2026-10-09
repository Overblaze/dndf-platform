// Gaining a level: what the next level gives (the plan), and the character after taking it.
// The plan is read from the rules data, so it is the same list the class table prints.
import { ABILITIES, type Ability, type AbilityScores, type ClassEntry, type FeatureDef, type OptionDef, type RuleEntry } from './types';
import { raceChoices } from './raceChoices';
import type { CharacterDoc } from './character';
import { classColumns, classScope } from './classes';
import { abilityMod, proficiencyBonus } from './core';
import { evaluateNumber } from './expr';
import { multiclassWarnings } from './multiclass';
import { rulesFor } from './customClass';
import { deriveSheet } from './sheet';

export interface LevelUpFeature {
  name: string;
  text: string;
  page: number;
  book: string;
  /** "Warrior 5", "Ryuo Samurai 7". */
  from: string;
}

export interface LevelUpChoice {
  /** The key in `doc.choices`. */
  id: string;
  name: string;
  /** How many the character may have at the new level, and how many it has now. */
  allowed: number;
  have: string[];
  options: { id: string; name: string; text: string; page: number }[];
  page: number;
  book: string;
}

/** The fixed number a class's "Hit Points at Higher Levels" line prints: 6 in "1d10 (or 6) + …". */
export function printedFixedHp(cls: Pick<ClassEntry, 'hitPoints'>): number | undefined {
  const printed = /\(or (\d+)\)/.exec(cls.hitPoints?.atHigherLevels ?? '');
  return printed ? Number(printed[1]) : undefined;
}

export interface LevelUpPlan {
  classId: string;
  className: string;
  /** True when this is the character's first level in the class. */
  newClass: boolean;
  classLevel: number;
  totalLevel: number;
  hitDie: number;
  /** The book's line for a level after the first: "1d10 (or 6) + your Constitution modifier per Warrior level after 1st". */
  hitPointsRule?: string;
  /** The fixed number that line prints, when it is not the die's average (the Chemist's "1d8 (or 6)"). The sheet's average stays the die's. */
  bookFixedHp?: number;
  conMod: number;
  /** Hit points for the level if the die is not rolled: half the die, plus one. */
  averageHp: number;
  proficiency: { from: number; to: number };
  features: LevelUpFeature[];
  /** Class table columns whose value changes: Ki 4 → 5, Martial Arts 1d6 → 1d8. */
  columns: { key: string; from: number | string | null; to: number | string }[];
  /** The class asks for its subclass at this level and none is chosen yet. */
  subclass?: { label: string; options: { id: string; name: string; page: number }[] };
  /** Option lists with room for more picks at the new level. */
  choices: LevelUpChoice[];
  /** This level is an Ability Score Improvement. */
  improvement: boolean;
  /** Reasons a strict reading would object (multiclass prerequisites). Shown, never enforced. */
  warnings: string[];
}

const subclassesOf = (rules: Map<string, RuleEntry>, classId: string) => [...rules.values()].filter((e) => e.kind === 'subclass' && e.parent === classId);

/** What the character gains by taking one more level in `classId` (a class it has, or a new one). */
export function levelUpPlan(doc: CharacterDoc, handbook: Map<string, RuleEntry>, classId: string): LevelUpPlan {
  const rules = rulesFor(doc, handbook);
  const cls = rules.get(classId) as ClassEntry | undefined;
  if (!cls || cls.kind !== 'class') throw new Error(`"${classId}" is not a class in the ${doc.rulesVersion} rules.`);
  const held = doc.classes.find((c) => c.id === classId);
  const classLevel = (held?.level ?? 0) + 1;
  const before = doc.classes.reduce((sum, c) => sum + c.level, 0);
  const subclassId = held?.subclass;
  const sub = subclassId ? rules.get(subclassId) : undefined;
  const scope = (level: number) => classScope({ cls, classLevel: level, totalLevel: before + 1, scores: doc.scores });

  const features: LevelUpFeature[] = [];
  const choices: LevelUpChoice[] = [];
  for (const entry of [cls, ...(sub ? [sub] : [])] as RuleEntry[]) {
    for (const feature of (entry.features ?? []) as FeatureDef[]) {
      if (feature.level === classLevel) {
        features.push({ name: feature.name, text: feature.text, page: feature.page, book: entry.source.book, from: `${entry.name} ${feature.level}` });
      }
      if (!feature.choices || feature.level > classLevel) continue;
      const allowed = evaluateNumber(feature.choices.count, scope(classLevel));
      const have = doc.choices[feature.choices.id] ?? [];
      // Listed when the feature arrives now, or when the count it allows has grown past what is picked.
      if (feature.level !== classLevel && have.length >= allowed) continue;
      const group = rules.get(feature.choices.from);
      choices.push({
        id: feature.choices.id, name: feature.name, allowed, have,
        options: ((group?.options ?? []) as OptionDef[]).map((o) => ({ id: o.id, name: o.name, text: o.text, page: o.page })),
        page: feature.page, book: entry.source.book,
      });
    }
  }

  // A racial pick-list whose count grows with the character's level (Cyborg Upgrades).
  for (const choice of raceChoices(doc, rules, before + 1)) {
    if (choice.picked.length >= choice.allowed) continue;
    choices.push({
      id: choice.id, name: choice.name, allowed: choice.allowed, have: choice.picked,
      options: choice.options.map((o) => ({ id: o.id, name: o.name, text: o.text, page: o.page })),
      page: choice.page, book: choice.book,
    });
  }

  const columns: LevelUpPlan['columns'] = [];
  const now = classColumns(cls, classLevel);
  const was = classLevel > 1 ? classColumns(cls, classLevel - 1) : {};
  for (const [key, to] of Object.entries(now)) {
    const from = key in was ? was[key]! : null;
    if (from !== to && !(from === null && (to === 0 || to === '—'))) columns.push({ key, from, to });
  }

  const wantsSubclass = !subclassId && cls.subclass && classLevel >= cls.subclass.level;
  const first = subclassesOf(rules, classId);
  const mainGroup = first[0]?.group;
  return {
    classId, className: cls.name, newClass: !held, classLevel, totalLevel: before + 1,
    hitDie: cls.hitDie, ...(cls.hitPoints?.atHigherLevels ? { hitPointsRule: cls.hitPoints.atHigherLevels } : {}),
    ...(printedFixedHp(cls) !== undefined && printedFixedHp(cls) !== cls.hitDie / 2 + 1 ? { bookFixedHp: printedFixedHp(cls) } : {}), conMod: abilityMod(doc.scores.con), averageHp: cls.hitDie / 2 + 1,
    proficiency: { from: proficiencyBonus(Math.max(1, before)), to: proficiencyBonus(before + 1) },
    features, columns, choices,
    subclass: wantsSubclass
      ? { label: cls.subclass!.label ?? 'Subclass', options: first.filter((s) => s.group === mainGroup).map((s) => ({ id: s.id, name: s.name, page: s.source.page })) }
      : undefined,
    improvement: ((cls.asiLevels ?? []) as number[]).includes(classLevel),
    warnings: held
      ? []
      : multiclassWarnings([...doc.classes.map((c) => rules.get(c.id)?.name ?? c.id), cls.name], doc.scores, rules),
  };
}

export interface LevelUpPicks {
  classId: string;
  /** The hit die roll for this level, or null to take the average. */
  hpRoll: number | null;
  subclass?: string;
  /** Option picks to set, by choice id (the whole list for each). */
  choices?: Record<string, string[]>;
  /** An Ability Score Improvement: what to add to each score. */
  scoreIncrease?: Partial<AbilityScores>;
  /** Or a feat taken in its place. */
  feat?: string;
}

/**
 * The character one level higher. Hit points gained are added to current hit points, and Dream
 * Points reset to the new level. Nothing is capped: a score may pass 20 if the player says so.
 */
export function applyLevelUp(doc: CharacterDoc, handbook: Map<string, RuleEntry>, picks: LevelUpPicks): { doc: CharacterDoc; hpGained: number; summary: string } {
  const rules = rulesFor(doc, handbook);
  const plan = levelUpPlan(doc, rules, picks.classId);
  // A roll typed in by hand is kept to what the die can show: a whole number from 1 to its size.
  const hpRoll = picks.hpRoll === null || !Number.isFinite(picks.hpRoll) ? null : Math.min(plan.hitDie, Math.max(1, Math.round(picks.hpRoll)));
  const index = doc.classes.findIndex((c) => c.id === picks.classId);
  const classes = doc.classes.map((c) => ({ ...c }));
  if (index < 0) {
    // A new class: every one of its levels is a "later" level, so its first roll is slot 0.
    classes.push({ id: picks.classId, level: 1, hpRolls: [hpRoll], subclass: picks.subclass });
  } else {
    const held = classes[index]!;
    const rolls = [...(held.hpRolls ?? [])];
    const laterLevels = index === 0 ? held.level - 1 : held.level;
    while (rolls.length < laterLevels) rolls.push(null);
    rolls.push(hpRoll);
    classes[index] = { ...held, level: held.level + 1, hpRolls: rolls, subclass: picks.subclass ?? held.subclass };
  }

  const scores = { ...doc.scores };
  const bonus = doc.scoreOrigin ? { ...doc.scoreOrigin.bonus } : undefined;
  for (const ability of ABILITIES) {
    const add = picks.scoreIncrease?.[ability as Ability] ?? 0;
    if (!add) continue;
    scores[ability] += add;
    if (bonus) bonus[ability] += add; // typed-in scores have no bonus column: the score itself is the record
  }
  const taken: CharacterDoc = {
    ...doc,
    classes,
    scores,
    scoreOrigin: doc.scoreOrigin && bonus ? { ...doc.scoreOrigin, bonus, ...(doc.scoreOrigin.method === 'manual' ? { base: scores, bonus: doc.scoreOrigin.bonus } : {}) } : doc.scoreOrigin,
    feats: picks.feat ? [...(doc.feats ?? []), picks.feat] : doc.feats,
    choices: { ...doc.choices, ...(picks.choices ?? {}) },
    state: { ...doc.state, dreamPointsSpent: 0 },
  };
  // Whatever the level did to the hit point maximum is gained now: the die and Constitution for this
  // level, and anything that reaches back over earlier levels (a higher Constitution, Tough, The King).
  const hpGained = deriveSheet(taken, rules).maxHp.value - deriveSheet(doc, rules).maxHp.value;
  const next: CharacterDoc = { ...taken, state: { ...taken.state, hp: Math.max(0, doc.state.hp + hpGained) } };
  const what = [
    `${plan.className} ${plan.classLevel}`,
    `${hpGained >= 0 ? '+' : ''}${hpGained} hit points${hpRoll === null ? '' : ` (rolled ${hpRoll})`}`,
    ...(picks.subclass ? [rules.get(picks.subclass)?.name ?? picks.subclass] : []),
    ...(picks.feat ? [`feat: ${rules.get(picks.feat)?.name ?? picks.feat}`] : []),
    ...ABILITIES.filter((a) => picks.scoreIncrease?.[a]).map((a) => `${a.toUpperCase()} +${picks.scoreIncrease![a]}`),
  ];
  return { doc: next, hpGained, summary: `Level up: ${what.join(', ')}` };
}
