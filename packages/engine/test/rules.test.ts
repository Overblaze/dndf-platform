// The remaining rows of docs/FORMULAS.md: DnDF general rules, Devil Fruit charges,
// bounty, rests, ships, and the Devilforged (v8.8) example.
import { describe, expect, it } from 'vitest';
import marlo from '../../../data/examples/marlo_devilforged5_v88.json';
import bruiserFile from '../../../data/rules/dndf-10/bruiser.json';
import {
  campaignSettings,
  abilityMod,
  bestialSummon,
  bounty,
  componentDamage,
  crewNeeded,
  dawn,
  deriveSheet,
  devilforgedPower,
  devilsBranding,
  dreamPointsMax,
  formatBerries,
  hakiPuristPicks,
  hakiTier,
  healingSurge,
  healingSurgeMaxDice,
  indexRules,
  isCramped,
  isOverCargo,
  kaito,
  levelUp,
  logiaCharges,
  longRest,
  parameciaCharges,
  piratePrestigeMax,
  powerPenalty,
  proficiencyBonus,
  rationDays,
  sailSpeed,
  shipAbilityMod,
  shipSoulAfterVoyage,
  shipSoulDc,
  shortHanded,
  shortRest,
  specialReactionReduction,
  specialReactionUses,
  travelDays,
  upcastCost,
  upgradeSlots,
  zoanBeastForm,
  zoanHumanFormScore,
  zoanInfusedWeapon,
  zoanMount,
  type CharacterDoc,
  type RulesFile,
} from '../src';

const rules = indexRules([bruiserFile as unknown as RulesFile]);
const doc = kaito(rules);
const level = 7;
const prof = proficiencyBonus(level);
const at = (state: Partial<CharacterDoc['state']>) => {
  const d = { ...doc, state: { ...doc.state, ...state } };
  return { d, s: deriveSheet(d, rules) };
};

describe('DnDF general rules', () => {
  it('Haki tier per color: T2 at 4 features, T3 at 6; Amateur (Common) don\'t count', () => {
    const features = (n: number, rarity = 'Uncommon') => Array.from({ length: n }, () => ({ rarity }));
    expect([0, 1, 3, 4, 5, 6, 9].map((n) => hakiTier(features(n)))).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(hakiTier([...features(3), ...features(5, 'Amateur')])).toBe(1);
    expect(hakiTier([...features(4), ...features(5, 'Common')])).toBe(2);
  });

  it('Haki Purist: picks at 4, 10, 16; lost on gaining a Devil Fruit', () => {
    expect([3, 4, 9, 10, 16, 20].map((l) => hakiPuristPicks(l, false))).toEqual([0, 1, 1, 2, 3, 3]);
    expect(hakiPuristPicks(16, true)).toBe(0);
    // v8.8 gives a pick at 4, 8, 12, 16 and 20.
    expect([3, 4, 8, 12, 16, 20].map((l) => hakiPuristPicks(l, false, 'dndf-8.8'))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Paramecia charges: L1–2: 2, then = level; highest spell level ceil(level / 2), max 9 → L7: 7, 4th', () => {
    expect(parameciaCharges(level)).toEqual({ charges: 7, highestSpellLevel: 4 });
    expect([1, 2, 3, 20].map((l) => parameciaCharges(l).charges)).toEqual([2, 2, 3, 20]);
    expect(parameciaCharges(20).highestSpellLevel).toBe(9);
  });

  it('Logia charges: 2,2,3,3,4,4,5, then level − 2; highest spell ceil((level + 2) / 2), max 9 → L7: 5, 5th', () => {
    expect(logiaCharges(level)).toEqual({ charges: 5, highestSpellLevel: 5 });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map((l) => logiaCharges(l).charges)).toEqual([2, 2, 3, 3, 4, 4, 5, 6, 18]);
    expect(logiaCharges(1).highestSpellLevel).toBe(2);
    expect(logiaCharges(20).highestSpellLevel).toBe(9);
  });

  it('Upcast fruit spell: +1 charge per level above base, up to the highest level', () => {
    expect(upcastCost(2, 2, 2, 4)).toBe(2);
    expect(upcastCost(2, 2, 4, 4)).toBe(4);
    expect(() => upcastCost(2, 2, 5, 4)).toThrow(/highest is 4/);
  });

  it('Zoan (eater): score + ceil(beast mod / 2), max 20; Beast Form uses = prof per dawn, ceil(level / 2) h → 3 uses, 4 h', () => {
    expect(zoanBeastForm(level, prof)).toEqual({ uses: 3, hours: 4 });
    expect(zoanHumanFormScore(18, 20)).toBe(20); // beast +5 → +3, capped at 20
    expect(zoanHumanFormScore(14, 17)).toBe(16); // beast +3 → +2
    expect(zoanHumanFormScore(14, 8)).toBe(14);
  });

  it('Power penalty variant: Very Rare −2 max charges; Legendary / Infernal −3', () => {
    expect(['Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Infernal'].map((r) => powerPenalty(r as never))).toEqual([0, 0, 2, 3, 3]);
    expect(parameciaCharges(level, powerPenalty('Very Rare')).charges).toBe(5);
    expect(logiaCharges(level, powerPenalty('Legendary')).charges).toBe(2);
  });

  it('Dream Points = level, reset on level-up → 7', () => {
    expect(dreamPointsMax(level)).toBe(7);
    const { d } = at({ dreamPointsSpent: 5 });
    const next = levelUp(d);
    expect(next.state.dreamPointsSpent).toBe(0);
    expect(deriveSheet(next, rules).dreamPoints).toEqual({ max: 8, remaining: 8 });
  });

  it('Healing Surge (ruling): up to max(1, floor(total HD / 2)), ≤ remaining → up to 3', () => {
    expect(healingSurgeMaxDice(7, 7)).toBe(3);
    expect(healingSurgeMaxDice(1, 1)).toBe(1);
    expect(healingSurgeMaxDice(7, 2)).toBe(2);
    expect(healingSurgeMaxDice(7, 0)).toBe(0);
  });

  it('Healing Surge: each die + Con, once per short or long rest', () => {
    const { d, s } = at({ hp: 20 });
    const result = healingSurge(d, s, [5, 9, 1, 12]);
    expect(result.state).toMatchObject({ hp: 20 + 5 + 9 + 1 + 9, hitDiceSpent: 3 });
    const after = deriveSheet({ ...d, state: result.state }, rules);
    expect(after.resources.find((r) => r.id === 'healing_surge')!.remaining).toBe(0);
    expect(shortRest({ ...d, state: result.state }, after).state.spent.healing_surge).toBeUndefined();
  });

  it('Special Reactions: each usable prof times per short rest; Parry / Deflect −(1d10 + level) → 3 each', () => {
    expect(specialReactionUses(prof)).toBe(3);
    expect(specialReactionReduction(level).text).toBe('1d10 + 7');
  });

  it('Pirate Prestige max: ceil(level / 2) → 4', () => {
    expect(piratePrestigeMax(level)).toBe(4);
    expect([1, 2, 20].map(piratePrestigeMax)).toEqual([1, 1, 10]);
  });

  it('Bounty: 49 + 8 + 10 + 30 + 15 = ฿112M', () => {
    const result = bounty({ level, crewmates: 8, fruitRarity: 'Uncommon', topHakiRarity: 'Very Rare', shipCon: 15 });
    expect(result.value).toBe(112_000_000);
    expect(result.lines.map((l) => l.value)).toEqual([49e6, 8e6, 10e6, 30e6, 15e6]);
    expect(formatBerries(result.value)).toBe('฿112M');
    expect(bounty({ level: 1, plunder: 250_000, civiliansHarmed: 3, majorDeeds: 1, noblesHarmed: 1 }).value).toBe(1e6 + 500_000 + 300_000 + 200e6);
  });
});

describe('Rests', () => {
  const tired = at({
    hp: 30,
    tempHp: 4,
    hitDiceSpent: 2,
    exhaustion: 2,
    toggles: { frenzied: true },
    spent: { fury: 3, thrill: 2, 'sr.parry': 1, healing_surge: 1, 'use.blood_for_brawn': 1 },
  });

  it('Short: spend hit dice (roll + Con each), refill short-rest uses, Special Reactions, Healing Surge and Fury', () => {
    const result = shortRest(tired.d, tired.s, { hitDiceRolls: [8, 3] });
    expect(result.state.hp).toBe(30 + 11 + 6);
    expect(result.state.hitDiceSpent).toBe(4);
    expect(result.state.spent).toEqual({ thrill: 2 });
    expect(result.state.toggles).toEqual({});
    expect(result.state.tempHp).toBe(4);
    expect(result.changes).toContain('Fury Points 1 → 4 of 4');
  });

  it('Short: Fury needs the 30 minutes of training confirmed', () => {
    const result = shortRest(tired.d, tired.s, { confirmed: { fury: false } });
    expect(result.state.spent.fury).toBe(3);
    expect(result.state.spent['sr.parry']).toBeUndefined();
  });

  it('Short: can\'t spend more hit dice than are left, and previewing changes nothing', () => {
    const result = shortRest(tired.d, tired.s, { hitDiceRolls: [1, 1, 1, 1, 1, 1, 1, 1] });
    expect(result.state.hitDiceSpent).toBe(7);
    expect(tired.d.state.hitDiceSpent).toBe(2);
  });

  it('Long: HP = max, temp HP cleared, ALL spent hit dice back (ruling), all uses, exhaustion −1', () => {
    const result = longRest(tired.d, tired.s);
    expect(result.state).toMatchObject({ hp: 75, tempHp: 0, hitDiceSpent: 0, exhaustion: 1, spent: {} });
    expect(result.changes).toEqual(expect.arrayContaining(['HP 30 → 75', 'Hit dice 5 → 7 of 7', 'Exhaustion 2 → 1', 'Thrill of the Fight 1 → 3 of 3']));
  });

  it('Long: a campaign can switch to the book\'s half hit dice', () => {
    const spent = at({ hitDiceSpent: 6 });
    const result = longRest(spent.d, spent.s, {}, campaignSettings({ longRestHitDice: 'half' }));
    expect(result.state.hitDiceSpent).toBe(3);
  });

  it('Long: Undying Frenzy DC → 10', () => {
    const veteran = levelUp({ ...doc, classes: [{ ...doc.classes[0]!, level: 12 }] });
    const d = { ...veteran, state: { ...veteran.state, counters: { undying_frenzy: 2 } } };
    expect(deriveSheet(d, rules).counters[0]!.value).toBe(20);
    const rested = longRest(d, deriveSheet(d, rules));
    expect(deriveSheet({ ...d, state: rested.state }, rules).counters[0]!.value).toBe(10);
  });

  it('Dawn: only per-day uses come back', () => {
    const result = dawn(tired.d, tired.s);
    expect(result.state.spent).toEqual(tired.d.state.spent);
    expect(result.changes).toEqual([]);
  });

  it('Level up: recompute all; Willpower + 1', () => {
    const next = deriveSheet(levelUp(doc), rules);
    expect(next.level).toBe(8);
    expect(next.willpower.value).toBe(8);
    expect(next.maxHp.value).toBe(85);
    expect(next.resources.find((r) => r.id === 'fury')!.max).toBe(5);
    expect(deriveSheet(levelUp(doc, 0, 12), rules).maxHp.value).toBe(90);
  });
});

describe('Ships (DM Guide) — sample Caravel', () => {
  it('Ship ability mod: as characters; score 0 auto-fails → Str 18 +4', () => {
    expect(shipAbilityMod(18)).toEqual({ mod: 4, autoFail: false });
    expect(shipAbilityMod(0).autoFail).toBe(true);
  });

  it('Component damage: damage ≥ threshold → all of it; below → none → 12 vs 10 → 12', () => {
    expect(componentDamage(12, 10)).toBe(12);
    expect(componentDamage(10, 10)).toBe(10);
    expect(componentDamage(9, 10)).toBe(0);
  });

  it('Sail speed: base − 5 ft per full 25 damage → 35 → 30 at 10 / 45 HP', () => {
    expect(sailSpeed(35, 45 - 10)).toBe(30);
    expect([0, 24, 25, 50].map((damage) => sailSpeed(35, damage))).toEqual([35, 35, 30, 25]);
  });

  it('Short-handed: crew ≤ half max → half speed, floor(weapons / 2) usable → 8: full; 4: 1 of 3', () => {
    expect(shortHanded(8, 8, 35, 3)).toEqual({ shortHanded: false, speed: 35, usableWeapons: 3 });
    expect(shortHanded(4, 8, 35, 3)).toEqual({ shortHanded: true, speed: 17, usableWeapons: 1 });
  });

  it('Crew count: ≤ Medium 1, Large 4, Huge 9, Gargantuan 20+', () => {
    expect((['Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const).map(crewNeeded)).toEqual([1, 1, 4, 9, 20]);
  });

  it('Cramped: aboard > crew max + passengers → more than 18', () => {
    expect(isCramped(18, 8, 10)).toBe(false);
    expect(isCramped(19, 8, 10)).toBe(true);
  });

  it('Over cargo → 3.2 of 10 t is fine', () => {
    expect(isOverCargo(3.2, 10)).toBe(false);
    expect(isOverCargo(10.5, 10)).toBe(true);
  });

  it('Upgrade slots: sum of installed ≤ ship slots (warn, don\'t block) → 3 / 5', () => {
    expect(upgradeSlots([1, 2], 5)).toEqual({ used: 3, total: 5, over: false });
    expect(upgradeSlots([3, 3], 5).over).toBe(true);
  });

  it('Travel: days = miles ÷ (pace × 24) → 240 ÷ 96 = 2.5', () => {
    expect(travelDays(240, 4)).toBe(2.5);
  });

  it('Rations: days = rations ÷ people aboard → 120 ÷ 8 = 15', () => {
    expect(rationDays(120, 8)).toBe(15);
  });

  it('Ship\'s soul: DC 10 Large / Huge, 15 Gargantuan; more than half succeed = 1; 3 = sentient', () => {
    expect((['Large', 'Huge', 'Gargantuan'] as const).map(shipSoulDc)).toEqual([10, 10, 15]);
    expect(shipSoulAfterVoyage(0, 5, 8)).toEqual({ points: 1, gained: 1, sentient: false });
    expect(shipSoulAfterVoyage(1, 4, 8).gained).toBe(0);
    expect(shipSoulAfterVoyage(2, 8, 8)).toEqual({ points: 3, gained: 1, sentient: true });
  });
});

describe('Devilforged v8.8 — Marlo, Devilforged 5, Blade Smithing, Cha 18', () => {
  const cha = abilityMod(marlo.abilityScores.final.cha);
  const marloProf = proficiencyBonus(marlo.level);

  it('Power save DC / attack: 8 + prof + Cha / prof + Cha → 15 / +7', () => {
    expect(devilforgedPower(marloProf, cha)).toEqual({ saveDc: 15, attack: 7 });
    expect(marlo.derived.spellSaveDC.value).toBe(15);
    expect(marlo.derived.spellAttack.value).toBe(7);
  });

  it('Slots: L5 → 2 slots of 3rd, short rest (checked against the class table in versions.test.ts)', () => {
    expect(marlo.spellcasting.slots).toMatchObject({ count: 2, level: 3, recharge: 'short', page: 112 });
  });

  it('Known: cantrips 3, powers 6, emanations 4 at L5', () => {
    expect(marlo.spellcasting.cantrips).toHaveLength(3);
    expect(marlo.spellcasting.spells).toHaveLength(6);
    expect(marlo.emanations).toHaveLength(4);
  });

  it('Hell\'s Duelist + Zoan Infusion: Cha for attack and damage, + rarity modifier, reach + 5 ft → katana +8, 1d8 + 5', () => {
    const katana = zoanInfusedWeapon({ prof: marloProf, abilityMod: cha, fruitRarity: marlo.infusedWeapon.fruit.rarity, damageDie: '1d8' });
    expect(katana).toEqual({ toHit: 8, damageBonus: 5, damage: '1d8 + 5', reach: 10 });
    expect(marlo.infusedWeapon.attack.toHit).toBe(8);
  });

  it('Bestial Summon: summoned beast +1 attack, damage, AC', () => {
    expect(bestialSummon({ ac: 12, attack: 6, damageBonus: 4, walkSpeed: 30 })).toEqual({ ac: 13, attack: 7, damageBonus: 5, walkSpeed: 30 });
  });

  it('Zoan Mount: ridden → walk 60 ft, Dash as bonus action', () => {
    const beast = { ac: 12, attack: 6, damageBonus: 4, walkSpeed: 30 };
    expect(zoanMount(beast, true)).toMatchObject({ walkSpeed: 60, dashAsBonusAction: true });
    expect(zoanMount(beast, false)).toMatchObject({ walkSpeed: 30, dashAsBonusAction: false });
  });

  it('Devil\'s Branding: +prof damage vs target, crit 19–20, heal level + Cha on its death → +3, heal 9', () => {
    expect(devilsBranding(marlo.level, marloProf, cha)).toEqual({ damageBonus: 3, critRange: 19, healOnDeath: 9 });
  });

  it('matches the rest of Marlo\'s example sheet: Willpower 5, Haki DC 13, Dream Points 5, Prestige 3', () => {
    expect(marlo.derived.willpower).toBe(5);
    expect(marlo.derived.hakiSaveDC).toBe(13);
    expect(dreamPointsMax(marlo.level)).toBe(marlo.derived.dreamPoints);
    expect(piratePrestigeMax(marlo.level)).toBe(marlo.derived.piratePrestigeMax);
  });
});
