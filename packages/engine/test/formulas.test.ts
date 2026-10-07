// One test per docs/FORMULAS.md row implemented so far, using the sample
// character from that file: Kaito Rourke, Human (Standard) Bruiser 7, v10.
import { describe, expect, it } from 'vitest';
import bruiserFile from '../../../data/rules/dndf-10/bruiser.json';
import {
  abilityMod,
  applyAbilityIncreases,
  armamentCoatedMuscles,
  bloodForBrawnThreshold,
  classScope,
  devilFruitAttackBonus,
  devilFruitSaveDc,
  enduringHonestyBonus,
  evaluate,
  findFeature,
  furyFeaturesKnown,
  furyPoints,
  furySaveDc,
  getClass,
  hakiAttackBonus,
  hakiSaveDc,
  indexRules,
  internalVibrations,
  maxHp,
  proficiencyBonus,
  scrapperDie,
  scrapperTempHp,
  thrillOfTheFight,
  undyingFrenzyDc,
  willpower,
  type AbilityScores,
  type ClassContext,
  type RulesFile,
} from '../src';

const rules = indexRules([bruiserFile as unknown as RulesFile]);
const bruiser = getClass(rules, 'class.bruiser');

const scores: AbilityScores = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
const level = 7;
const kaito: ClassContext = { cls: bruiser, classLevel: level, scores };
const at = (classLevel: number): ClassContext => ({ ...kaito, classLevel });
const prof = proficiencyBonus(level);
const con = abilityMod(scores.con);
const total = (lines: { value: number | string }[]) => lines.reduce((sum, l) => sum + Number(l.value), 0);

describe('Core 5e', () => {
  it('Ability mod: floor((score − 10) / 2) → Str +4', () => {
    expect(abilityMod(scores.str)).toBe(4);
    expect(abilityMod(scores.int)).toBe(-1);
    expect([1, 9, 10, 11, 20, 22].map(abilityMod)).toEqual([-5, -1, 0, 0, 5, 6]);
  });

  it('Proficiency: 2 + floor((total level − 1) / 4) → +3', () => {
    expect(prof).toBe(3);
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it('Max HP: d12 max + Con, then average + Con per level → 75', () => {
    const hp = maxHp({ hitDie: bruiser.hitDie, level, conMod: con });
    expect(hp.value).toBe(75);
    expect(total(hp.lines)).toBe(75);
    expect(maxHp({ hitDie: 12, level: 1, conMod: 3 }).value).toBe(15);
  });

  it('Max HP: Con changes are retroactive', () => {
    expect(maxHp({ hitDie: 12, level, conMod: con + 1 }).value).toBe(75 + level);
  });
});

describe('DnDF', () => {
  it('Willpower: 1 at L1, +1 per level gained (max 20) → 7', () => {
    const wp = willpower({ level });
    expect(wp.value).toBe(7);
    expect(total(wp.lines)).toBe(7);
    expect(willpower({ level: 1 }).value).toBe(1);
    expect(willpower({ level: 20 }).value).toBe(20);
  });

  it('Willpower: Strengthen Self +2', () => {
    expect(willpower({ level, strengthenSelf: 1 }).value).toBe(9);
  });

  it('Willpower: capped at 20 in total, Strengthen Self included', () => {
    const wp = willpower({ level: 19, strengthenSelf: 2 });
    expect(wp.value).toBe(20);
    expect(total(wp.lines)).toBe(20);
    expect(willpower({ level: 20, strengthenSelf: 1 }).value).toBe(20);
    expect(willpower({ level, variant: { spiritualAdvancements: 25 } }).value).toBe(20);
  });

  it('Willpower variant: 0 + 1 per Spiritual Advancement', () => {
    expect(willpower({ level, variant: { spiritualAdvancements: 0 } }).value).toBe(0);
    expect(willpower({ level, variant: { spiritualAdvancements: 3 } }).value).toBe(3);
  });

  const wp = willpower({ level }).value;

  it('Haki save DC: 10 + ceil(Willpower / 2) → 14', () => {
    expect(hakiSaveDc(wp).value).toBe(14);
    expect(total(hakiSaveDc(wp).lines)).toBe(14);
    expect(hakiSaveDc(8).value).toBe(14);
  });

  it('Haki attack (table ruling): 2 + ceil(Willpower / 2) → +6', () => {
    expect(hakiAttackBonus(wp).value).toBe(6);
  });

  it('Devil Fruit save DC: 10 + ceil(Willpower / 2) → 14', () => {
    expect(devilFruitSaveDc(wp).value).toBe(14);
  });

  it('Devil Fruit attack: 2 + ceil(Willpower / 2) → +6', () => {
    expect(devilFruitAttackBonus(wp).value).toBe(6);
  });
});

describe('Bruiser (v10)', () => {
  it('Scrapper die: d4 L1–4, d6 5–8, d8 9–12, d10 13–16, d12 17–20 → d6', () => {
    expect(scrapperDie(bruiser, level)).toBe('d6');
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map((l) => scrapperDie(bruiser, l))).toEqual([
      'd4', 'd4', 'd6', 'd6', 'd8', 'd8', 'd10', 'd10', 'd12', 'd12',
    ]);
  });

  it('Fury points: L1 0, then 2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,12 → 4', () => {
    expect(furyPoints(kaito)).toBe(4);
    expect(Array.from({ length: 20 }, (_, i) => furyPoints(at(i + 1)))).toEqual([
      0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 12,
    ]);
  });

  it('Fury features known = prof → 3', () => {
    expect(furyFeaturesKnown(kaito)).toBe(3);
  });

  it('Fury save DC: 8 + prof + Con → 14, with a line for each part', () => {
    const dc = furySaveDc(kaito);
    expect(dc.value).toBe(14);
    expect(dc.lines).toEqual([
      { label: 'Base', value: 8 },
      { label: 'Proficiency bonus', value: 3 },
      { label: 'Constitution modifier', value: 3 },
    ]);
  });

  it('Thrill of the Fight: prof uses per long rest, +prof melee damage → 3, +3', () => {
    expect(thrillOfTheFight(kaito)).toEqual({ uses: 3, damageBonus: 3 });
  });

  it('Brace for Impact: temp HP = Scrapper roll + bruiser level → 1d6 + 7', () => {
    expect(scrapperTempHp(bruiser, level)).toMatchObject({ count: 1, die: 'd6', bonus: 7, text: '1d6 + 7' });
  });

  it('Enduring Honesty: Persuasion + ceil(level / 4) → +2', () => {
    expect(enduringHonestyBonus(level)).toBe(2);
    expect([2, 4, 5, 8, 9, 20].map(enduringHonestyBonus)).toEqual([1, 1, 2, 2, 3, 5]);
  });

  it('Blood for Brawn: at ≤ half max HP → ≤ 37 HP', () => {
    const hp = maxHp({ hitDie: bruiser.hitDie, level, conMod: con }).value;
    expect(bloodForBrawnThreshold(hp)).toBe(37);
  });

  it('Undying Frenzy: Con save DC 10, +5 per use', () => {
    expect([0, 1, 2].map(undyingFrenzyDc)).toEqual([10, 15, 20]);
  });

  it('Armament-Coated Muscles: DR = Con; or +ceil(Con / 2) hit and +Con dmg → 3 / +2, +3', () => {
    expect(armamentCoatedMuscles(con)).toEqual({ damageReduction: 3, attackBonus: 2, damageBonus: 3 });
  });

  it('Internal Vibrations: ceil(prof / 2) d6 thunder → 2d6', () => {
    expect(internalVibrations(prof).text).toBe('2d6');
    const hasshoken = rules.get('subclass.bruiser.hasshoken')!;
    const display = findFeature(hasshoken, 'Internal Vibrations').effects![0]!;
    expect(evaluate(display.expr!, classScope(kaito))).toBe('2d6');
  });

  it('The King (20): Str, Con +2, cap 22', () => {
    expect(applyAbilityIncreases(scores, bruiser, 'The King')).toMatchObject({ str: 20, con: 18, dex: 14 });
    expect(applyAbilityIncreases({ ...scores, str: 21, con: 20 }, bruiser, 'The King')).toMatchObject({ str: 22, con: 22 });
  });
});
