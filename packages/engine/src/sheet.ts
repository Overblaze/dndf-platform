// Turns a saved character + the rules data into every number on the sheet, each with
// its line-by-line breakdown. The website and the Discord bot both call this.
import { DEFAULT_SETTINGS, SKILLS, type CampaignSettings, type CharacterDoc, type WeaponDef } from './character';
import { classColumns } from './classes';
import { abilityMod, maxHp, proficiencyBonus } from './core';
import { fillTemplate, formatDice, parseDice } from './dice';
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
  type RuleEntry,
  type ToggleDef,
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
  action?: string;
  cost?: Record<string, number>;
  /** Resource holding this feature's limited uses. */
  resource?: string;
  toggle?: string;
  rolls: SheetRoll[];
  displays: { label: string; value: string }[];
  onUse: OnUseDef[];
  counter?: string;
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
  hitDice: { die: number; total: number; remaining: number };
  dreamPoints: { max: number; remaining: number };
  prestigeMax: number;
  healingSurgeDice: number;
  specialReactionReduction: string;
  attacksPerAction: number;
  resources: SheetResource[];
  toggles: SheetToggle[];
  trackers: SheetTracker[];
  counters: SheetCounter[];
  attacks: SheetAttack[];
  features: SheetFeature[];
  /** Effects in force right now (resistances, advantage, exhaustion). */
  notes: { label: string; from: string }[];
  warnings: string[];
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function stat(doc: CharacterDoc, key: string, label: string, derived: Derived): Stat {
  const own = doc.overrides[key];
  const overridden = typeof own === 'number' && Number.isFinite(own);
  return { key, label, value: overridden ? own : derived.value, calculated: derived.value, overridden, lines: derived.lines, page: derived.page };
}

const sum = (lines: BreakdownLine[]) => lines.reduce((total, l) => total + Number(l.value), 0);

/** Scrapper's definition: simple melee weapons without two-handed, cutlasses, kanabos and improvised weapons — v10 p86. */
export function isBruiserWeapon(weapon: WeaponDef): boolean {
  if (weapon.ranged) return false;
  if (weapon.category === 'improvised' || /^(cutlass|kanabo)$/i.test(weapon.name.trim())) return true;
  return weapon.category === 'simple' && !weapon.twoHanded;
}

const averageOf = (dice: string) => parseDice(dice).terms.reduce((total, t) => total + (t.count * (t.sides + 1)) / 2, 0);

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
}

export function deriveSheet(doc: CharacterDoc, rules: Map<string, RuleEntry>, settings: CampaignSettings = DEFAULT_SETTINGS): Sheet {
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
        active.push({ def, source, from: `${entry.name} ${def.level}`, key: `${entry.id}/${slug(def.name)}` });
        if (!def.choices) continue;
        const group = rules.get(def.choices.from);
        const options = (group?.options ?? []) as OptionDef[];
        for (const id of doc.choices[def.choices.id] ?? []) {
          const option = options.find((o) => o.id === id);
          if (option && group) active.push({ def: option, source: { ...source, entry: group }, from: group.name, key: `${group.id}/${option.id}` });
          else warnings.push(`"${id}" is not one of the ${group?.name ?? def.choices.from}.`);
        }
      }
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
    page: 209,
  });

  // 3. What rules expressions can see.
  const toggleDefs = active.flatMap((a) => (a.def.toggle ? [{ def: a.def.toggle as ToggleDef, feature: a }] : []));
  const on: ExprScope = {};
  for (const { def } of toggleDefs) on[def.id] = Boolean(doc.state.toggles[def.id]);
  const scopeFor = (source: Source, extra: ExprScope = {}): ExprScope => ({
    level: source.classLevel,
    prof: prof.value,
    mod,
    col: classColumns(source.cls, source.classLevel),
    on,
    noArmor: doc.armor === null,
    noShield: !doc.shield,
    bruiserWeapon: false,
    ...extra,
  });

  interface ActiveEffect {
    effect: EffectDef;
    source: Source;
    from: string;
  }
  const effects: ActiveEffect[] = [];
  for (const a of active) {
    for (const effect of (a.def.effects ?? []) as EffectDef[]) effects.push({ effect, source: a.source, from: a.def.name });
  }
  for (const { def, feature } of toggleDefs) {
    if (!on[def.id]) continue;
    for (const effect of def.effects ?? []) effects.push({ effect, source: feature.source, from: feature.def.name });
  }
  const applies = (e: ActiveEffect, extra?: ExprScope) => !e.effect.when || Boolean(evaluate(e.effect.when, scopeFor(e.source, extra)));
  const amount = (e: ActiveEffect, extra?: ExprScope) => (e.effect.expr ? evaluateNumber(e.effect.expr, scopeFor(e.source, extra)) : e.effect.value ?? 0);
  const ofType = (type: string, extra?: ExprScope) => effects.filter((e) => e.effect.type === type && applies(e, extra));
  const bonusLines = (type: string, extra?: ExprScope): BreakdownLine[] =>
    ofType(type, extra).map((e) => ({ label: e.from, value: amount(e, extra) }));

  const notes: Sheet['notes'] = ofType('note').map((e) => ({ label: String(e.effect.label ?? ''), from: e.from }));
  const exhaustion = doc.state.exhaustion;
  const exhaustionNote = (min: number, label: string) => exhaustion >= min && notes.push({ label, from: `Exhaustion ${exhaustion}` });
  exhaustionNote(1, 'Disadvantage on ability checks');
  exhaustionNote(3, 'Disadvantage on attack rolls and saving throws');

  // 4. Proficiencies.
  const first = sources[0];
  const saveProfs = new Set<Ability>([...((first?.cls.savingThrows as Ability[] | undefined) ?? []), ...(doc.extraSaves ?? [])]);
  const skillProfs = new Set(doc.skills);
  for (const e of ofType('proficiency')) if (typeof e.effect.skill === 'string') skillProfs.add(e.effect.skill);

  const saves = {} as Sheet['saves'];
  for (const a of ABILITIES) {
    const lines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[a]} modifier`, value: mod[a]! }];
    if (saveProfs.has(a)) lines.push({ label: 'Proficiency bonus', value: prof.value });
    saves[a] = { ...stat(doc, `save.${a}`, `${ABILITY_NAMES[a]} save`, { value: sum(lines), lines }), proficient: saveProfs.has(a) };
  }

  const skills: SheetSkill[] = SKILLS.map((skill) => {
    const proficient = skillProfs.has(skill.id);
    const expertise = proficient && doc.expertise.includes(skill.id);
    const lines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[skill.ability]} modifier`, value: mod[skill.ability]! }];
    if (proficient) lines.push({ label: expertise ? 'Proficiency bonus × 2 (expertise)' : 'Proficiency bonus', value: prof.value * (expertise ? 2 : 1) });
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
    acOptions.push({ label: e.from, lines: explain(e.effect.expr!, scopeFor(e.source)).lines, page: (e.source.entry.features?.find((f) => f.name === e.from)?.page) });
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
  const initiative = stat(doc, 'initiative', 'Initiative', { value: sum(initLines), lines: initLines, page: 52 });

  const hpLines: BreakdownLine[] = [];
  doc.classes.forEach((picked, i) => {
    const cls = rules.get(picked.id) as ClassEntry | undefined;
    if (!cls?.hitDie) return;
    hpLines.push(...maxHp({ hitDie: cls.hitDie, level: picked.level, conMod: mod.con!, rolls: picked.hpRolls, first: i === 0 }).lines);
  });
  if (exhaustion >= 4) hpLines.push({ label: `Exhaustion ${exhaustion}: maximum halved`, value: -Math.ceil(sum(hpLines) / 2) });
  const maxHpStat = stat(doc, 'maxHp', 'Hit point maximum', { value: sum(hpLines), lines: hpLines, page: first?.cls.source.page });

  const carryLines: BreakdownLine[] = [{ label: `Strength ${scores.str} × 15 lb`, value: scores.str * 15 }];
  const multiply = (label: string, factor: number) => carryLines.push({ label, value: sum(carryLines) * (factor - 1) });
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
  const featureResource = new Map<string, string>();
  for (const a of active) {
    const uses = a.def.uses as UsesDef | string | undefined;
    if (!uses) continue;
    if (typeof uses === 'string') {
      featureResource.set(a.key, uses.slice(4));
    } else {
      const id = `use.${slug(a.def.name)}`;
      featureResource.set(a.key, id);
      resourceDefs.push({ def: { id, name: a.def.name, max: uses.max, recharge: uses.recharge }, source: a.source, page: a.def.page });
    }
  }
  const resources: SheetResource[] = resourceDefs.map(({ def, source, page }) => {
    const key = `resource.${def.id}`;
    const calculated = evaluateNumber(def.max, source ? scopeFor(source) : {});
    const max = stat(doc, key, def.name, { value: calculated, lines: [] }).value;
    return { id: def.id, name: def.name, max, remaining: Math.max(0, max - (doc.state.spent[def.id] ?? 0)), recharge: def.recharge, confirm: def.confirm, page };
  });
  const general = (id: string, name: string, max: number) =>
    resources.push({ id, name, max, remaining: Math.max(0, max - (doc.state.spent[id] ?? 0)), recharge: 'short', page: 11 });
  general('sr.parry', 'Parry Blow', specialReactionUses(prof.value));
  general('sr.deflect', 'Deflect Projectile', specialReactionUses(prof.value));
  general('healing_surge', 'Healing Surge', 1);

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
    ((source.entry.trackers ?? []) as TrackerDef[]).map((def) => {
      const max = evaluateNumber(def.max, scopeFor(source));
      const value = Math.min(max, Math.max(def.min, doc.state.trackers[def.id] ?? def.min));
      return { id: def.id, name: def.name, min: def.min, max, value, page: def.page ?? source.entry.source.page, levels: def.levels };
    }),
  );

  const counters: SheetCounter[] = active.flatMap((a) => {
    const def = a.def.counter as CounterDef | undefined;
    if (!def) return [];
    const count = doc.state.counters[def.id] ?? 0;
    return [{ id: def.id, label: def.label, count, value: evaluateNumber(def.expr, scopeFor(a.source, { count })), reset: def.reset, feature: a.key }];
  });

  // 10. Attacks.
  const scrapper = ofType('unarmedDie')[0];
  const scrapperDice = scrapper ? `1${evaluate(scrapper.effect.expr!, scopeFor(scrapper.source))}` : null;
  const weaponProfs = new Set(sources.flatMap((s) => ((s.cls.proficiencies as { weapons?: string[] } | undefined)?.weapons ?? [])));
  const unarmed: WeaponDef = { id: 'unarmed', name: 'Unarmed strike', damage: '1', damageType: 'bludgeoning', category: 'simple', proficient: true };

  const attacks: SheetAttack[] = [unarmed, ...doc.weapons].map((weapon) => {
    const isUnarmed = weapon.id === 'unarmed';
    const bruiserWeapon = isUnarmed || isBruiserWeapon(weapon);
    const extra: ExprScope = { bruiserWeapon };
    const useScrapper = scrapperDice !== null && bruiserWeapon;
    const attackNotes: string[] = [];

    let ability: Ability = 'str';
    if (weapon.ranged) ability = 'dex';
    else if (weapon.finesse && !useScrapper && mod.dex! > mod.str!) ability = 'dex';
    if (weapon.finesse && useScrapper) attackNotes.push('Finesse can\'t be used with a bruiser weapon');

    const proficient = weapon.proficient ?? (weaponProfs.has(weapon.category) || weaponProfs.has(slug(weapon.name)));
    const hitLines: BreakdownLine[] = [{ label: `${ABILITY_NAMES[ability]} modifier`, value: mod[ability]! }];
    if (proficient) hitLines.push({ label: 'Proficiency bonus', value: prof.value });
    else attackNotes.push('Not proficient');
    if (weapon.bonus) hitLines.push({ label: 'Item bonus', value: weapon.bonus });
    hitLines.push(...bonusLines('attack', extra));

    let dice = weapon.damage;
    if (useScrapper && averageOf(scrapperDice) > averageOf(weapon.damage)) dice = scrapperDice;
    const damageLines: BreakdownLine[] = [
      { label: dice === scrapperDice && useScrapper ? `${scrapper!.from} die` : 'Weapon die', value: dice },
      { label: `${ABILITY_NAMES[ability]} modifier`, value: mod[ability]! },
    ];
    if (weapon.bonus) damageLines.push({ label: 'Item bonus', value: weapon.bonus });
    damageLines.push(...bonusLines('damage', extra));
    const spec = parseDice(dice);
    spec.bonus += damageLines.slice(1).reduce((total, l) => total + Number(l.value), 0);

    return {
      id: weapon.id,
      name: weapon.name,
      toHit: stat(doc, `attack.${weapon.id}`, `${weapon.name} attack`, { value: sum(hitLines), lines: hitLines }),
      damage: formatDice(spec),
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
      rolls: ((def.rolls ?? []) as RollDef[]).map((r) => ({ label: r.label, kind: r.kind, dice: formatDice(parseDice(fillTemplate(r.dice, scope))) })),
      displays: ((def.effects ?? []) as EffectDef[])
        .filter((e) => e.type === 'display' && e.expr)
        .map((e) => ({ label: String(e.label ?? def.name), value: String(evaluate(e.expr!, scope)) })),
      onUse: (def.onUse ?? []) as OnUseDef[],
      counter: (def.counter as CounterDef | undefined)?.id,
    };
  });

  const hitDie = first?.cls.hitDie ?? 8;
  const dreamMax = dreamPointsMax(level);
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
    hitDice: { die: hitDie, total: level, remaining: Math.max(0, level - doc.state.hitDiceSpent) },
    dreamPoints: { max: dreamMax, remaining: Math.max(0, dreamMax - doc.state.dreamPointsSpent) },
    prestigeMax: piratePrestigeMax(level),
    healingSurgeDice: healingSurgeMaxDice(level, Math.max(0, level - doc.state.hitDiceSpent)),
    specialReactionReduction: specialReactionReduction(level).text,
    attacksPerAction: Math.max(1, ...ofType('attacksPerAction').map((e) => amount(e))),
    resources,
    toggles,
    trackers,
    counters,
    attacks,
    features,
    notes,
    warnings,
  };
}
