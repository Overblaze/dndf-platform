// Kaito's whole sheet, derived from his saved document: the Core 5e rows of
// docs/FORMULAS.md, plus the toggles, resources and overrides the live sheet uses.
import { describe, expect, it } from 'vitest';
import bruiserFile from '../../../data/rules/dndf-10/bruiser.json';
import {
  applyDamage,
  applyHealing,
  deriveSheet,
  freshState,
  gainTempHp,
  indexRules,
  isBruiserWeapon,
  iWontAbandonMyDreams,
  kaito,
  newBruiser,
  rescueDeathSave,
  setToggle,
  setTracker,
  spendResource,
  useFeature,
  type CharacterDoc,
  type RulesFile,
} from '../src';

const rules = indexRules([bruiserFile as unknown as RulesFile]);
const doc = kaito(rules);
const sheet = deriveSheet(doc, rules);
const withState = (state: Partial<CharacterDoc['state']>): CharacterDoc => ({ ...doc, state: { ...doc.state, ...state } });
const total = (lines: { value: number | string }[]) => lines.reduce((sum, l) => sum + Number(l.value), 0);
const res = (s: typeof sheet, id: string) => s.resources.find((r) => r.id === id)!;

describe('Core 5e, from Kaito\'s sheet', () => {
  it('Weapon attack: Str + prof → +7', () => {
    const unarmed = sheet.attacks.find((a) => a.id === 'unarmed')!;
    expect(unarmed.toHit.value).toBe(7);
    expect(unarmed.toHit.lines).toEqual([
      { label: 'Strength modifier', value: 4 },
      { label: 'Proficiency bonus', value: 3 },
    ]);
  });

  it('Weapon damage: Scrapper die + Str → 1d6 + 4 (+3 frenzied)', () => {
    expect(sheet.attacks.map((a) => a.damage)).toEqual(['1d6 + 4', '1d6 + 4']);
    const frenzied = deriveSheet(withState({ toggles: { frenzied: true } }), rules);
    expect(frenzied.attacks[0]!.damage).toBe('1d6 + 7');
    expect(frenzied.attacks[0]!.damageLines.at(-1)).toEqual({ label: 'Thrill of the Fight', value: 3 });
  });

  it('Weapon damage: the Scrapper die only applies to bruiser weapons', () => {
    const club = { id: 'c', name: 'Club', damage: '1d4', damageType: 'bludgeoning', category: 'simple' } as const;
    expect(isBruiserWeapon(club)).toBe(true);
    expect(isBruiserWeapon({ ...club, name: 'Greatclub', twoHanded: true })).toBe(false);
    expect(isBruiserWeapon({ ...club, name: 'Cutlass', category: 'martial' })).toBe(true);
    expect(isBruiserWeapon({ ...club, name: 'Longsword', category: 'martial' })).toBe(false);
    expect(isBruiserWeapon({ ...club, name: 'Sling', ranged: true })).toBe(false);
    const armed = deriveSheet({ ...doc, weapons: [{ ...club, id: 'ls', name: 'Longsword', damage: '1d8', category: 'martial', damageType: 'slashing' }] }, rules);
    const longsword = armed.attacks[1]!;
    expect(longsword.damage).toBe('1d8 + 4');
    expect(longsword.toHit.value).toBe(4);
    expect(longsword.notes).toContain('Not proficient');
    const frenzied = deriveSheet({ ...armed, ...withState({ toggles: { frenzied: true } }), weapons: [{ ...club, id: 'ls', name: 'Longsword', damage: '1d8', category: 'martial', damageType: 'slashing' }] }, rules);
    expect(frenzied.attacks[1]!.damage).toBe('1d8 + 4');
  });

  it('Save: mod + prof if proficient → Str +7, Con +6', () => {
    expect(sheet.saves.str.value).toBe(7);
    expect(sheet.saves.con.value).toBe(6);
    expect(sheet.saves.dex).toMatchObject({ value: 2, proficient: false });
  });

  it('Skill: mod + prof (× 2 expertise) → Athletics +7', () => {
    const skill = (s: typeof sheet, id: string) => s.skills.find((k) => k.id === id)!;
    expect(skill(sheet, 'athletics').value).toBe(7);
    expect(skill(sheet, 'stealth').value).toBe(2);
    // Enduring Honesty gives Persuasion.
    expect(skill(sheet, 'persuasion')).toMatchObject({ value: 3, proficient: true });
    expect(sheet.skills.filter((k) => k.proficient).map((k) => k.id)).toEqual(['athletics', 'intimidation', 'perception', 'persuasion']);
    expect(skill(deriveSheet({ ...doc, expertise: ['athletics'] }, rules), 'athletics').value).toBe(10);
  });

  it('Passive Perception: 10 + Perception → 14', () => {
    expect(sheet.passivePerception.value).toBe(14);
  });

  it('Initiative: Dex mod → +2', () => {
    expect(sheet.initiative.value).toBe(2);
  });

  it('AC: Offensive Defense 10 + Dex + Con with no armor and no shield → 15', () => {
    expect(sheet.ac.value).toBe(15);
    expect(total(sheet.ac.lines)).toBe(15);
    expect(sheet.ac.page).toBe(86);
  });

  it('AC: armor formula, 10 + Dex, and shield + 2', () => {
    const shielded = deriveSheet({ ...doc, shield: true }, rules);
    expect(shielded.ac.value).toBe(14); // 10 + Dex 2 + shield 2: Offensive Defense needs no shield
    const armored = deriveSheet({ ...doc, armor: { name: 'Chain shirt', base: 13, dexCap: 2 }, shield: true }, rules);
    expect(armored.ac.value).toBe(17);
    const heavy = deriveSheet({ ...doc, armor: { name: 'Chain mail', base: 16, dexCap: 0 } }, rules);
    expect(heavy.ac.value).toBe(16);
  });

  it('Speed: race base + 10 Offensive Defense → 40 ft', () => {
    expect(sheet.speed.value).toBe(40);
    expect(deriveSheet({ ...doc, armor: { name: 'Leather', base: 11 } }, rules).speed.value).toBe(30);
  });

  it('Max HP → 75, with rolls replacing the average when given', () => {
    expect(sheet.maxHp.value).toBe(75);
    const rolled = deriveSheet({ ...doc, classes: [{ ...doc.classes[0]!, hpRolls: [12, 1, null] }] }, rules);
    expect(rolled.maxHp.value).toBe(12 + 12 + 1 + 4 * 7 + 21);
  });

  it('Carry: Str × 15 lb → 270; × 2 per size step; × 2 Tireless Training', () => {
    expect(sheet.carry.value).toBe(270);
    expect(deriveSheet({ ...doc, race: { ...doc.race, sizeSteps: 1 } }, rules).carry.value).toBe(540);
    const level15 = newBruiser({ name: 'Old Kaito', level: 15, scores: doc.scores }, rules);
    expect(deriveSheet(level15, rules).carry.value).toBe(540);
    expect(deriveSheet({ ...level15, race: { ...level15.race, sizeSteps: 1 } }, rules).carry.value).toBe(1080);
  });

  it('Temp HP: don\'t stack (keep higher); damage hits temp first; HP clamps 0..max', () => {
    let state = gainTempHp(freshState(75), 8);
    state = gainTempHp(state, 5);
    expect(state.tempHp).toBe(8);
    state = applyDamage(state, 12);
    expect(state).toMatchObject({ tempHp: 0, hp: 71 });
    expect(applyDamage(state, 500).hp).toBe(0);
    expect(applyHealing(state, 500, 75).hp).toBe(75);
    expect(applyDamage(state, -5).hp).toBe(71);
  });
});

describe('the rest of the sheet', () => {
  it('has Willpower 7, Haki save DC 14 and the table-ruling Haki attack +6', () => {
    expect(sheet.willpower.value).toBe(7);
    expect(sheet.hakiSaveDc.value).toBe(14);
    expect(sheet.hakiAttack?.value).toBe(6);
    expect(deriveSheet(doc, rules, { hakiAttackRuling: false, longRestHitDice: 'all' }).hakiAttack).toBeNull();
  });

  it('lists the general DnDF numbers: Dream Points 7, Prestige 4, Healing Surge 3, Special Reactions 3 each', () => {
    expect(sheet.dreamPoints).toEqual({ max: 7, remaining: 7 });
    expect(sheet.prestigeMax).toBe(4);
    expect(sheet.healingSurgeDice).toBe(3);
    expect(res(sheet, 'sr.parry').max).toBe(3);
    expect(res(sheet, 'sr.deflect').max).toBe(3);
    expect(sheet.specialReactionReduction).toBe('1d10 + 7');
  });

  it('has the Bruiser resources: Fury 4, Thrill 3, Blood for Brawn 1', () => {
    expect(res(sheet, 'fury')).toMatchObject({ max: 4, remaining: 4, recharge: 'short' });
    expect(res(sheet, 'thrill')).toMatchObject({ max: 3, recharge: 'long' });
    expect(res(sheet, 'use.blood_for_brawn')).toMatchObject({ max: 1, recharge: 'short' });
  });

  it('only includes features of the character\'s level, class and style, and the Fury features picked', () => {
    const names = sheet.features.map((f) => f.name);
    expect(names).toContain('Frenzied Rush');
    expect(names).toContain('Armament-Coated Muscles');
    expect(names).toContain('Brace for Impact');
    expect(names).not.toContain('Undying Frenzy');
    expect(names).not.toContain('Internal Vibrations');
    expect(names).not.toContain('Focused Strike');
    expect(sheet.attacksPerAction).toBe(2);
  });

  it('keeps the book text word for word with a page on every feature', () => {
    const source = (bruiserFile.entries[0]!.features as { name: string; text: string }[]).find((f) => f.name === 'Offensive Defense')!;
    const shown = sheet.features.find((f) => f.name === 'Offensive Defense')!;
    expect(shown.text).toBe(source.text);
    expect(sheet.features.every((f) => f.page > 0 && f.book.length > 0)).toBe(true);
  });

  it('works out feature dice: Brace for Impact 1d6 + 7, Armament-Coated Muscles 3 / +2 / +3', () => {
    expect(sheet.features.find((f) => f.name === 'Brace for Impact')!.rolls).toEqual([{ label: 'Temporary hit points', dice: '1d6 + 7', kind: 'tempHp' }]);
    expect(sheet.features.find((f) => f.name === 'Armament-Coated Muscles')!.displays.map((d) => d.value)).toEqual(['3', '2', '3']);
  });

  it('entering the frenzy spends a Thrill use, regains 1 Fury (Frenzied Rush) and shows its effects', () => {
    const spent = spendResource(doc.state, sheet, 'fury', 2).state;
    const result = setToggle(spent, sheet, 'frenzied', true);
    expect(result.state.toggles.frenzied).toBe(true);
    const after = deriveSheet({ ...doc, state: result.state }, rules);
    expect(res(after, 'thrill').remaining).toBe(2);
    expect(res(after, 'fury').remaining).toBe(3);
    expect(after.notes.map((n) => n.label)).toContain('Resistance to bludgeoning, piercing, and slashing damage');
    expect(sheet.notes).toEqual([]);
    // Switching off costs nothing.
    const off = setToggle(result.state, after, 'frenzied', false);
    expect(res(deriveSheet({ ...doc, state: off.state }, rules), 'thrill').remaining).toBe(2);
  });

  it('a level 3 Bruiser does not regain Fury on entering the frenzy', () => {
    const young = newBruiser({ name: 'Young', level: 3, scores: doc.scores }, rules);
    const s = deriveSheet(young, rules);
    const spent = spendResource(young.state, s, 'fury', 1).state;
    const after = deriveSheet({ ...young, state: setToggle(spent, s, 'frenzied', true).state }, rules);
    expect(res(after, 'fury').remaining).toBe(1);
  });

  it('using a Fury feature spends Fury; running out warns but does not block', () => {
    const brace = sheet.features.find((f) => f.name === 'Brace for Impact')!;
    let state = doc.state;
    for (let i = 0; i < 4; i++) state = useFeature(state, sheet, brace).state;
    expect(res(deriveSheet({ ...doc, state }, rules), 'fury').remaining).toBe(0);
    const empty = useFeature(state, deriveSheet({ ...doc, state }, rules), brace);
    expect(empty.warning).toBe('No Fury Points left.');
    expect(empty.state.spent.fury).toBe(4);
  });

  it('Blood for Brawn spends its use and refills Fury', () => {
    const blood = sheet.features.find((f) => f.name === 'Blood for Brawn')!;
    const low = spendResource(doc.state, sheet, 'fury', 4).state;
    const after = deriveSheet({ ...doc, state: useFeature(low, sheet, blood).state }, rules);
    expect(res(after, 'fury').remaining).toBe(4);
    expect(res(after, 'use.blood_for_brawn').remaining).toBe(0);
  });

  it('Undying Frenzy raises its DC by 5 each use (level 13)', () => {
    const veteran = newBruiser({ name: 'Veteran', level: 13, scores: doc.scores }, rules);
    let s = deriveSheet(veteran, rules);
    expect(s.counters).toMatchObject([{ id: 'undying_frenzy', value: 10 }]);
    const feature = s.features.find((f) => f.name === 'Undying Frenzy')!;
    const state = useFeature(useFeature(veteran.state, s, feature).state, s, feature).state;
    s = deriveSheet({ ...veteran, state }, rules);
    expect(s.counters[0]!.value).toBe(20);
  });

  it('The King raises Str and Con by 2 at level 20, and everything that depends on them', () => {
    const king = deriveSheet(newBruiser({ name: 'King', level: 20, scores: doc.scores }, rules), rules);
    expect(king.abilities.str).toEqual({ score: 20, mod: 5 });
    expect(king.abilities.con).toEqual({ score: 18, mod: 4 });
    expect(king.ac.value).toBe(16);
    expect(king.willpower.value).toBe(20);
  });

  it('tracks King Punch charges within the cap for the level', () => {
    const fighter = newBruiser({ name: 'Elizabello', level: 11, scores: doc.scores, subclass: 'subclass.bruiser.king' }, rules);
    const s = deriveSheet(fighter, rules);
    expect(s.trackers).toMatchObject([{ id: 'king_charges', max: 40, value: 0 }]);
    expect(setTracker(fighter.state, s, 'king_charges', 99).trackers.king_charges).toBe(40);
  });

  it('applies exhaustion: speed halved at 2, hit point maximum halved at 4, speed 0 at 5', () => {
    expect(deriveSheet(withState({ exhaustion: 2 }), rules).speed.value).toBe(20);
    expect(deriveSheet(withState({ exhaustion: 4 }), rules).maxHp.value).toBe(37);
    expect(deriveSheet(withState({ exhaustion: 5 }), rules).speed.value).toBe(0);
  });

  it('lets the player override any number and still shows the calculated one', () => {
    const edited = deriveSheet({ ...doc, overrides: { ac: 18, 'skill.stealth': 9, prof: 4, 'resource.fury': 6 } }, rules);
    expect(edited.ac).toMatchObject({ value: 18, calculated: 15, overridden: true });
    expect(edited.skills.find((k) => k.id === 'stealth')).toMatchObject({ value: 9, calculated: 2 });
    // An overridden proficiency bonus flows into everything that uses it.
    expect(edited.saves.str.value).toBe(8);
    expect(res(edited, 'thrill').max).toBe(4);
    expect(res(edited, 'fury').max).toBe(6);
    expect(sheet.ac.overridden).toBe(false);
  });

  it('reports data it cannot find as a warning instead of failing', () => {
    const odd = deriveSheet({ ...doc, choices: { furyFeatures: ['nope'] }, classes: [{ ...doc.classes[0]!, subclass: 'subclass.bruiser.nope' }] }, rules);
    expect(odd.warnings).toHaveLength(2);
    expect(odd.maxHp.value).toBe(75);
  });
});

describe('dying', () => {
  it('I Won\'t Abandon My Dreams: d20 ≥ 12 → 1 HP; an exhaustion-6 death → exhaustion 5', () => {
    const dead = { ...freshState(75), hp: 0, exhaustion: 6, deathSaves: { successes: 0, failures: 3 } };
    expect(iWontAbandonMyDreams(dead, 11).survived).toBe(false);
    const saved = iWontAbandonMyDreams(dead, 12);
    expect(saved.survived).toBe(true);
    expect(saved.state).toMatchObject({ hp: 1, exhaustion: 5, deathSaves: { successes: 0, failures: 0 } });
  });

  it('a Dream Point turns a failed death save into a success', () => {
    const dying = { ...freshState(75), hp: 0, deathSaves: { successes: 1, failures: 2 } };
    expect(rescueDeathSave(dying, 7)).toMatchObject({ dreamPointsSpent: 1, deathSaves: { successes: 2, failures: 1 } });
    // With no Dream Points left, nothing changes.
    expect(rescueDeathSave({ ...dying, dreamPointsSpent: 7 }, 7)).toMatchObject({ dreamPointsSpent: 7, deathSaves: { successes: 1, failures: 2 } });
  });
});
