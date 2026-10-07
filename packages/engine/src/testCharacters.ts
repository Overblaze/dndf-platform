// Made-up characters with the numbers the books give them, worked out by hand.
//
// Each one exists to exercise something: a class's formulas, a subclass, a race, feats, a
// background and crew role, or multiclassing. The expected numbers are written next to the
// arithmetic that produces them, straight from the rule on the cited page, so the engine is
// checked against the books rather than against itself. The site can also load them, to look at.
//
// Abbreviations: EH10 / EH8.8 = DnDF Expanded Handbook v10 / v8.8.
import { freshState, type CharacterDoc, type WeaponDef } from './character';
import { armorFromItem, weaponFromItem } from './items';
import { newCharacter, type NewCharacterInput } from './sample';
import { deriveSheet, type Sheet } from './sheet';
import type { Ability, RuleEntry, RulesVersion } from './types';

export interface TestCharacter {
  id: string;
  name: string;
  version: RulesVersion;
  /** What this character is here to check. */
  checks: string;
  build: (rules: Map<string, RuleEntry>) => CharacterDoc;
  /** Sheet values by key (see readSheet), each worked out by hand in the comments beside it. */
  expected: Record<string, number | string>;
  /** Words that must appear in one of the sheet's warnings (multiclass prerequisites). */
  expectedWarnings?: string[];
}

type Extra = Partial<CharacterDoc> | ((doc: CharacterDoc, rules: Map<string, RuleEntry>) => Partial<CharacterDoc>);

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });

function make(input: NewCharacterInput, extra: Extra = {}) {
  return (rules: Map<string, RuleEntry>): CharacterDoc => {
    const race = input.raceId ? rules.get(input.subraceId ?? '') ?? rules.get(input.raceId) : undefined;
    const base = newCharacter({ ...input, speed: input.speed ?? (typeof race?.speed === 'number' ? race.speed : rules.get(input.raceId ?? '')?.speed as number | undefined) }, rules);
    const doc = { ...base, ...(typeof extra === 'function' ? extra(base, rules) : extra) };
    // Start at full hit points for whatever the finished build's maximum is.
    return { ...doc, state: { ...freshState(deriveSheet(doc, rules).maxHp.value), ...(doc.state.trackers ? { trackers: doc.state.trackers } : {}), exhaustion: doc.state.exhaustion } };
  };
}

const weapon = (rules: Map<string, RuleEntry>, id: string, more: Partial<WeaponDef> = {}): WeaponDef => ({ ...weaponFromItem(rules.get(`item.${id}`)!)!, ...more });
const armor = (rules: Map<string, RuleEntry>, id: string) => armorFromItem(rules.get(`item.${id}`)!);

export const TEST_CHARACTERS: TestCharacter[] = [
  {
    id: 'kaito',
    name: 'Kaito Rourke',
    version: 'dndf-10',
    checks: 'The Bruiser and every core formula (docs/FORMULAS.md sample).',
    build: make({ name: 'Kaito Rourke', level: 7, scores: scores(18, 14, 16, 8, 12, 10), subclass: 'subclass.bruiser.black_fist', skills: ['athletics', 'intimidation', 'perception'], furyFeatures: ['brace_for_impact', 'keep_going', 'brute_force'] },
      (_d, r) => ({ weapons: [weapon(r, 'club')] })),
    expected: {
      prof: 3, // 2 + floor((7 − 1) / 4) — EH10 p.209
      maxHp: 75, // 12 + 6 × 7 + Con 3 × 7 — EH10 p.85
      ac: 15, // Offensive Defense 10 + Dex 2 + Con 3 — EH10 p.86
      speed: 40, // 30 + 10 Offensive Defense
      initiative: 2,
      willpower: 7, // 1 at 1st, +1 per level — EH10 p.221
      hakiSaveDc: 14, // 10 + ceil(7 / 2)
      passivePerception: 14, // 10 + Wis 1 + prof 3
      carry: 270, // Str 18 × 15 — EH10 p.10
      'save.str': 7,
      'save.con': 6,
      'save.dex': 2,
      'skill.athletics': 7,
      'skill.persuasion': 3, // Enduring Honesty gives proficiency: Cha 0 + 3
      'attack.Unarmed strike.hit': 7,
      'attack.Unarmed strike.damage': '1d6 + 4', // Scrapper d6 at 5th–8th
      'attack.Club.damage': '1d6 + 4', // d4 club takes the larger Scrapper die
      'resource.Fury Points': 4,
      'resource.Thrill of the Fight': 3,
      'formula.Fury save DC': 14, // 8 + 3 + Con 3
      attacksPerAction: 2,
      hitDice: '7d12',
      dreamPoints: 7,
    },
  },
  {
    id: 'bruiser-20-king',
    name: 'Elizabello the Second',
    version: 'dndf-10',
    checks: 'A 20th-level Bruiser: The King raising Strength and Constitution, Tireless Training, King Style.',
    build: make({ name: 'Elizabello the Second', level: 20, scores: scores(18, 14, 16, 8, 12, 10), subclass: 'subclass.bruiser.king' }),
    expected: {
      'score.str': 20, // The King: +2, cap 22 — EH10 p.87
      'score.con': 18,
      prof: 6,
      maxHp: 225, // 12 + 19 × 7 + Con 4 × 20
      ac: 16, // 10 + Dex 2 + Con 4
      carry: 600, // Str 20 × 15 × 2 Tireless Training
      willpower: 20,
      hakiSaveDc: 20,
      'save.str': 11,
      'skill.athletics': 11, // King Style Bonus Proficiency: Str 5 + 6
      'skill.intimidation': 6,
      'attack.Unarmed strike.hit': 11,
      'attack.Unarmed strike.damage': '1d12 + 5',
      'resource.Fury Points': 12,
      'tracker.King Punch Charges.max': 60, // Supreme King Punch at 17th
      hitDice: '20d12',
    },
  },
  {
    id: 'martial-artist-7',
    name: 'Koby',
    version: 'dndf-10',
    checks: 'Martial Artist: Unarmored Defense, Unarmored Movement, the Martial Arts die with Dexterity, Ki.',
    build: make({ name: 'Koby', classId: 'class.martial_artist', level: 7, scores: scores(10, 16, 14, 10, 14, 8), subclass: 'subclass.martial_artist.six_powers' }),
    expected: {
      maxHp: 52, // 8 + 6 × 5 + Con 2 × 7
      ac: 15, // 10 + Dex 3 + Wis 2 — EH10 p.149
      speed: 45, // 30 + 15 at 6th — EH10 p.150
      initiative: 3,
      'attack.Unarmed strike.hit': 6, // Dex 3 + prof 3
      'attack.Unarmed strike.damage': '1d8 + 3',
      'resource.Ki Points': 7,
      'formula.Ki save DC': 13, // 8 + 3 + Wis 2
      attacksPerAction: 2,
      hitDice: '7d8',
    },
  },
  {
    id: 'hybrid-10',
    name: 'Reiju',
    version: 'dndf-10',
    checks: 'Hybrid: Close Quarters Training and Power Threshold reading the Hybrid Points held.',
    build: make({ name: 'Reiju', classId: 'class.hybrid', level: 10, scores: scores(16, 12, 14, 10, 10, 16), subclass: 'subclass.hybrid.germa' },
      (d) => ({ state: { ...d.state, trackers: { hybrid_points: 7 } } })),
    expected: {
      maxHp: 84, // 10 + 9 × 6 + Con 2 × 10
      ac: 12, // 10 + Dex 1 + 1 for 7 points held (one per 5) — EH10 p.132
      'attack.Unarmed strike.hit': 9, // Str 3 + prof 4 + 2 (one per 3 points)
      'attack.Unarmed strike.damage': '1d8 + 6', // 1d8, Str 3 + 3 (one per 2 points)
      'formula.Hybrid save DC': 15, // 8 + 4 + Cha 3 — EH10 p.131
      'formula.Hybrid attack modifier': 7,
      'tracker.Hybrid Points.max': 7,
      attacksPerAction: 2,
    },
  },
  {
    id: 'virtuoso-5',
    name: 'Brook',
    version: 'dndf-10',
    checks: 'Virtuoso: Jack of All Trades, Expertise, Harmonic Weaponry using Charisma, spell slots.',
    build: make({ name: 'Brook', classId: 'class.virtuoso', level: 5, scores: scores(8, 14, 12, 10, 10, 18), subclass: 'subclass.virtuoso.mockery', skills: ['performance'] },
      (_d, r) => ({ expertise: ['performance'], weapons: [weapon(r, 'rapier', { ability: 'cha' })] })),
    expected: {
      maxHp: 33, // 8 + 4 × 5 + Con 1 × 5
      ac: 12,
      initiative: 3, // Dex 2 + half proficiency 1 — EH10 p.195
      'skill.performance': 10, // Cha 4 + prof 3 × 2
      'skill.stealth': 3, // Dex 2 + 1
      'skill.athletics': 0, // Str −1 + 1
      'formula.Spirit save DC': 15,
      'formula.Spirit attack modifier': 7,
      'attack.Rapier.hit': 7,
      'attack.Rapier.damage': '1d8 + 4',
      'resource.1st-level slots': 4,
      'resource.2nd-level slots': 3,
      'resource.3rd-level slots': 2,
    },
  },
  {
    id: 'marlo',
    name: 'Marlo Vance',
    version: 'dndf-8.8',
    checks: 'The v8.8 Devilforged from data/examples: caster numbers, Hell\'s Duelist, background and crew role skills, armor and shield.',
    build: make({ name: 'Marlo Vance', rulesVersion: 'dndf-8.8', classId: 'class.devilforged', level: 5, scores: scores(13, 14, 15, 9, 11, 18), subclass: 'subclass.devilforged.blade_smithing', backgroundId: 'background.salvager', crewRoleId: 'crewRole.shipwright', skills: ['deception', 'intimidation'] },
      (_d, r) => ({ armor: armor(r, 'hide'), shield: true, weapons: [weapon(r, 'katana', { ability: 'cha', proficient: true, bonus: 1 })] })),
    expected: {
      maxHp: 38, // 8 + 4 × 5 + Con 2 × 5 — EH8.8 p.112
      prof: 3,
      ac: 16, // Hide 12 + Dex 2 (max 2) + shield 2
      initiative: 2,
      speed: 30,
      willpower: 5,
      hakiSaveDc: 13,
      passivePerception: 13, // Salvager gives Perception: 10 + Wis 0 + 3
      'skill.athletics': 4, // Shipwright: Str 1 + 3
      'skill.investigation': 2, // Salvager: Int −1 + 3
      'formula.Spell save DC': 15, // 8 + 3 + Cha 4 — EH8.8 p.113
      'formula.Spell attack modifier': 7,
      'attack.Katana.hit': 8, // Cha 4 + prof 3 + 1 (Uncommon fruit)
      'attack.Katana.damage': '1d8 + 5',
      'resource.Devil Power slots': 2,
      hitDice: '5d8',
    },
  },
  {
    id: 'priest-6',
    name: 'Gan Fall',
    version: 'dndf-8.8',
    checks: 'Priest: Channel Divinity growing at 6th, the Kami\'s Will pool, medium armor and a shield.',
    build: make({ name: 'Gan Fall', rulesVersion: 'dndf-8.8', classId: 'class.priest', level: 6, scores: scores(10, 10, 12, 10, 18, 10), subclass: 'subclass.priest.sky' },
      (_d, r) => ({ armor: armor(r, 'scale_mail'), shield: true })),
    expected: {
      maxHp: 39, // 8 + 5 × 5 + Con 1 × 6
      ac: 16, // Scale Mail 14 + Dex 0 + shield 2
      'save.wis': 7,
      'formula.Spell save DC': 15,
      'formula.Spell attack modifier': 7,
      'resource.Channel Divinity': 3,
      'resource.Kami’s Will healing pool': 30, // 5 × 6
      'resource.1st-level slots': 4,
      'resource.2nd-level slots': 3,
      'resource.3rd-level slots': 3,
    },
  },
  {
    id: 'warrior-8',
    name: 'Kin\'emon',
    version: 'dndf-10',
    checks: 'Warrior: two Fighting Styles changing AC and ranged attacks, heavy armor, Strike save DC, Extra Attack.',
    build: make({ name: 'Kin\'emon', classId: 'class.warrior', level: 8, scores: scores(18, 12, 14, 10, 10, 10), subclass: 'subclass.warrior.ryuo_samurai', choices: { fightingStyle: ['defense', 'aiming'] } },
      (_d, r) => ({ armor: armor(r, 'chain_mail'), weapons: [weapon(r, 'longsword'), weapon(r, 'musket')] })),
    expected: {
      maxHp: 68, // 10 + 7 × 6 + Con 2 × 8
      ac: 17, // Chain Mail 16 + Defense 1 — EH10 p.201
      'attack.Longsword.hit': 7,
      'attack.Longsword.damage': '1d8 + 4',
      'attack.Musket.hit': 5, // Dex 1 + prof 3 + Aiming 1
      'attack.Musket.damage': '1d10 + 1',
      'formula.Strike save DC': 15, // 8 + 3 + Str 4 — EH10 p.202
      'resource.Action Surge': 1,
      'resource.Second Wind': 1,
      attacksPerAction: 2,
      hitDice: '8d10',
    },
  },
  {
    id: 'marksman-6-v88',
    name: 'Yasopp',
    version: 'dndf-8.8',
    checks: 'v8.8 Marksman: Hawk-Eyed, the v8.8 Aiming style (+2), a firearm.',
    build: make({ name: 'Yasopp', rulesVersion: 'dndf-8.8', classId: 'class.marksman', level: 6, scores: scores(10, 18, 12, 10, 14, 10), subclass: 'subclass.marksman.sniper', skills: ['perception'], choices: { fightingStyle: ['aiming'] } },
      (_d, r) => ({ weapons: [weapon(r, 'musket')] })),
    expected: {
      maxHp: 46, // 10 + 5 × 6 + Con 1 × 6
      'skill.perception': 8, // Wis 2 + prof 3 × 2 — EH8.8 p.147
      passivePerception: 18,
      'attack.Musket.hit': 9, // Dex 4 + prof 3 + Aiming 2
      'attack.Musket.damage': '1d10 + 4',
      'formula.Tactic save DC': 13,
      attacksPerAction: 2,
    },
  },
  {
    id: 'marksman-14',
    name: 'Van Augur',
    version: 'dndf-10',
    checks: 'v10 Marksman at 14th: three attacks, Improved Aiming (+3), Lock-On at its top dice.',
    build: make({ name: 'Van Augur', classId: 'class.marksman', level: 14, scores: scores(10, 20, 12, 10, 16, 10), subclass: 'subclass.marksman.gunslinger', skills: ['perception'], choices: { fightingStyle: ['improved_aiming'] } },
      (_d, r) => ({ weapons: [weapon(r, 'musket')] })),
    expected: {
      prof: 5,
      'attack.Musket.hit': 13, // Dex 5 + prof 5 + 3 — EH10 p.142
      'skill.perception': 13, // Wis 3 + 5 × 2
      'roll.Lock-On.0': '4d4 + 3', // 4d4 at 14th, + Wis from Greater Lock-On
      attacksPerAction: 3, // EH10 p.143
    },
  },
  {
    id: 'renegade-8',
    name: 'Cavendish',
    version: 'dndf-10',
    checks: 'Renegade: Press the Attack stacks adding to hit.',
    build: make({ name: 'Cavendish', classId: 'class.renegade', level: 8, scores: scores(10, 18, 10, 10, 10, 14), subclass: 'subclass.renegade.swashbuckler' },
      (d, r) => ({ weapons: [weapon(r, 'rapier')], state: { ...d.state, trackers: { press_the_attack: 2 } } })),
    expected: {
      maxHp: 43, // 8 + 7 × 5
      'attack.Rapier.hit': 9, // Dex 4 + prof 3 + 2 stacks — EH10 p.172
      'tracker.Press the Attack stacks.max': 4, // half level, rounded up
      'roll.Press the Attack.0': '2d4',
    },
  },
  {
    id: 'rogue-15',
    name: 'Nami',
    version: 'dndf-8.8',
    checks: 'v8.8 Rogue: Slippery Mind adding a Wisdom save at 15th.',
    build: make({ name: 'Nami', rulesVersion: 'dndf-8.8', classId: 'class.rogue', level: 15, scores: scores(10, 18, 10, 14, 12, 14), subclass: 'subclass.rogue.thief' }),
    expected: {
      prof: 5,
      maxHp: 78, // 8 + 14 × 5
      'save.wis': 6, // Wis 1 + prof 5
      'save.dex': 9,
      'save.int': 7,
    },
  },
  {
    id: 'conqueror-5',
    name: 'Bellamy',
    version: 'dndf-10',
    checks: 'Conqueror: Leadership Dice from the table, Extra Attack.',
    build: make({ name: 'Bellamy', classId: 'class.conqueror', level: 5, scores: scores(16, 12, 14, 10, 14, 12), subclass: 'subclass.conqueror.warmonger' }),
    expected: {
      maxHp: 44, // 10 + 4 × 6 + Con 2 × 5
      'resource.Leadership Dice': 4,
      'roll.Conqueror’s Leadership.0': '1d8', // d8 from 5th — EH10 p.106
      attacksPerAction: 2,
    },
  },
  {
    id: 'chemist-5',
    name: 'Chopper',
    version: 'dndf-10',
    checks: 'Chemist: Wisdom caster numbers, Monster Mutation uses, spell slots.',
    build: make({ name: 'Chopper', classId: 'class.chemist', level: 5, scores: scores(10, 12, 12, 12, 16, 10), subclass: 'subclass.chemist.medicine' }),
    expected: {
      maxHp: 33, // 8 + 4 × 5 + Con 1 × 5
      'formula.Invention save DC': 14,
      'formula.Invention attack modifier': 6,
      'resource.Monster Mutation': 2,
      'resource.1st-level slots': 4,
      'resource.2nd-level slots': 3,
      'resource.3rd-level slots': 2,
    },
  },
  {
    id: 'tinkerer-4',
    name: 'Franky',
    version: 'dndf-8.8',
    checks: 'v8.8 Tinkerer: Intelligence caster numbers, a d6 hit die.',
    build: make({ name: 'Franky', rulesVersion: 'dndf-8.8', classId: 'class.tinkerer', level: 4, scores: scores(12, 12, 12, 16, 10, 10), subclass: 'subclass.tinkerer.robotics' }),
    expected: {
      maxHp: 22, // 6 + 3 × 4 + Con 1 × 4
      'formula.Creation save DC': 13,
      'formula.Creation attack modifier': 5,
      'resource.1st-level slots': 4,
      'resource.2nd-level slots': 3,
      hitDice: '4d6',
    },
  },
  {
    id: 'oracle-5',
    name: 'Shyarly',
    version: 'dndf-10',
    checks: 'Oracle: Wisdom caster numbers.',
    build: make({ name: 'Shyarly', classId: 'class.oracle', level: 5, scores: scores(8, 12, 10, 12, 16, 14), subclass: 'subclass.oracle.gambler_of_fate' }),
    expected: {
      maxHp: 22, // 6 + 4 × 4
      'formula.Spell save DC': 14,
      'formula.Spell attack modifier': 6,
      'save.wis': 6,
      'save.cha': 5,
    },
  },
  {
    id: 'skald-9',
    name: 'Scratchmen Apoo',
    version: 'dndf-8.8',
    checks: 'v8.8 Skald at 9th: Jack of All Trades at +2, Song of the Sea\'s die, 5th-level slots.',
    build: make({ name: 'Scratchmen Apoo', rulesVersion: 'dndf-8.8', classId: 'class.skald', level: 9, scores: scores(10, 14, 10, 10, 10, 18), subclass: 'subclass.skald.battlehymn' }),
    expected: {
      prof: 4,
      maxHp: 48, // 8 + 8 × 5
      initiative: 4, // Dex 2 + half of 4
      'skill.stealth': 4,
      'formula.Spirit save DC': 16,
      'roll.Song of the Sea.0': '1d8', // 1d8 at 9th — EH8.8 p.185
      'resource.5th-level slots': 1,
    },
  },
  {
    id: 'devilforged-5-v10',
    name: 'Vegapunk Lilith',
    version: 'dndf-10',
    checks: 'v10 Devilforged: Intelligence for its save DC, Extra Attack.',
    build: make({ name: 'Vegapunk Lilith', classId: 'class.devilforged', level: 5, scores: scores(10, 14, 14, 16, 10, 10), subclass: 'subclass.devilforged.devil_gunner' }),
    expected: {
      maxHp: 38, // 8 + 4 × 5 + Con 2 × 5
      'formula.Devilforged save DC': 14, // 8 + 3 + Int 3 — EH10 p.114
      'formula.Devilforged attack modifier': 6,
      attacksPerAction: 2,
    },
  },
  {
    id: 'feats',
    name: 'Jesus Burgess',
    version: 'dndf-10',
    checks: 'Feats that change numbers: Alert, Mobile, Tough, Big Eater, a weapon feat, and a feat that grants a skill.',
    build: make({ name: 'Jesus Burgess', classId: 'class.warrior', level: 4, scores: scores(16, 14, 14, 10, 10, 10), feats: ['feat.alert', 'feat.mobile', 'feat.tough', 'feat.big_eater', 'feat.armor_breaker', 'feat.sharkskin'] },
      (_d, r) => ({ weapons: [weapon(r, 'mace'), weapon(r, 'club')] })),
    expected: {
      initiative: 7, // Dex 2 + Alert 5 — EH10 p.52
      speed: 40, // 30 + Mobile 10 — EH10 p.59
      maxHp: 44, // 10 + 3 × 6 + Con 2 × 4 + Tough 2 × 4 — EH10 p.64
      carry: 480, // Str 16 × 15 × 2 Big Eater — EH10 p.53
      'attack.Mace.hit': 6, // Str 3 + prof 2 + Armor Breaker 1 — EH10 p.52
      'attack.Mace.damage': '1d6 + 3',
      'attack.Club.hit': 5, // not a mace: no bonus
      'skill.intimidation': 2, // Sharkskin gives proficiency: Cha 0 + 2 — EH10 p.62
    },
  },
  {
    id: 'race-background-role',
    name: 'Oimo',
    version: 'dndf-10',
    checks: 'Skills arriving from a subrace, a background, a crew role, a class feature and a subclass, and Powerful Build doubling carrying.',
    build: make({ name: 'Oimo', level: 3, scores: scores(16, 12, 14, 10, 10, 10), subclass: 'subclass.bruiser.beast', raceId: 'race.human', subraceId: 'subrace.human.giant', raceName: 'Human (Giant)', backgroundId: 'background.salvager', crewRoleId: 'crewRole.shipwright', skills: ['intimidation', 'survival'] }),
    expected: {
      maxHp: 32, // 12 + 2 × 7 + Con 2 × 3
      ac: 13, // 10 + Dex 1 + Con 2
      speed: 40,
      carry: 480, // Str 16 × 15 × 2 Powerful Build — EH10 p.67
      'skill.athletics': 5, // Natural Athlete (Giant) and Shipwright: Str 3 + 2
      'skill.acrobatics': 3, // Beast Style Bonus Proficiency: Dex 1 + 2 — EH10 p.88
      'skill.investigation': 2, // Salvager — EH10 p.46
      'skill.perception': 2, // Salvager
      'skill.persuasion': 2, // Enduring Honesty — EH10 p.87
      'skill.intimidation': 2,
      'skill.survival': 2,
      'skill.stealth': 1, // not proficient
      proficientSkills: 7,
    },
  },
  {
    id: 'mink',
    name: 'Carrot',
    version: 'dndf-10',
    checks: 'A race whose trait grants two skills (Mink: Animal Instinct).',
    build: make({ name: 'Carrot', classId: 'class.martial_artist', level: 3, scores: scores(10, 16, 12, 10, 14, 10), subclass: 'subclass.martial_artist.black_leg_style', raceId: 'race.mink', raceName: 'Mink' }),
    expected: {
      maxHp: 21, // 8 + 2 × 5 + Con 1 × 3
      ac: 15,
      speed: 40, // 30 + 10 Unarmored Movement
      'skill.perception': 4, // Animal Instinct: Wis 2 + 2 — EH10 p.73
      'skill.stealth': 5,
    },
  },
  {
    id: 'multiclass-bruiser-warrior',
    name: 'Jozu',
    version: 'dndf-10',
    checks: 'Multiclassing: hit points and hit dice from two classes, proficiency from total level, each class\'s features at its own level.',
    build: make({ name: 'Jozu', level: 5, scores: scores(16, 14, 16, 8, 10, 10), subclass: 'subclass.bruiser.black_fist' },
      (d) => ({ classes: [...d.classes, { id: 'class.warrior', level: 3, subclass: 'subclass.warrior.black_weapon' }] })),
    expected: {
      level: 8,
      prof: 3, // total level 8 — EH10 p.209
      maxHp: 82, // 12 + 4 × 7 (Bruiser 2–5) + 3 × 6 (Warrior, no first-level maximum) + Con 3 × 8 — EH10 p.209
      hitDice: '5d12 + 3d10',
      ac: 15, // Offensive Defense
      willpower: 8,
      'attack.Unarmed strike.hit': 6,
      'attack.Unarmed strike.damage': '1d6 + 3', // Scrapper die for Bruiser level 5
      'resource.Fury Points': 3, // Bruiser level 5
      'resource.Thrill of the Fight': 3, // proficiency bonus, from total level
      'resource.Action Surge': 1,
      'roll.Second Wind.0': '1d10 + 3', // Warrior level, not total level
      attacksPerAction: 2, // Bruiser 5; the Warrior's comes at Warrior 5 and wouldn't add — EH10 p.210
      'save.str': 6,
      'save.dex': 2, // saves come from the first class only
      warnings: 0,
    },
  },
  {
    id: 'multiclass-pooled-casters',
    name: 'Enel',
    version: 'dndf-10',
    checks: 'Multiclass spellcasting: Priest and Tinkerer levels are added and read from the Multiclass Spellcaster table.',
    build: make({ name: 'Enel', classId: 'class.priest', level: 3, scores: scores(10, 12, 12, 14, 16, 10), subclass: 'subclass.priest.sky' },
      (d) => ({ classes: [...d.classes, { id: 'class.tinkerer', level: 2, subclass: 'subclass.tinkerer.meteorology' }] })),
    expected: {
      level: 5,
      prof: 3,
      maxHp: 31, // 8 + 2 × 5 (Priest 2–3) + 2 × 4 (Tinkerer) + Con 1 × 5
      hitDice: '3d8 + 2d6',
      'resource.1st-level slots': 4, // caster level 3 + 2 = 5: 4 / 3 / 2 — EH10 p.210
      'resource.2nd-level slots': 3,
      'resource.3rd-level slots': 2,
      'formula.Spell save DC': 14, // Priest: 8 + 3 + Wis 3
      'formula.Creation save DC': 13, // Tinkerer: 8 + 3 + Int 2
      'save.wis': 6,
      'save.int': 2, // the Tinkerer's saves are not gained by multiclassing
      warnings: 0,
    },
  },
  {
    id: 'multiclass-separate-casters',
    name: 'Caesar Clown',
    version: 'dndf-10',
    checks: 'Multiclass casters the handbook does not pool (Chemist and Oracle): each keeps its own table\'s slots.',
    build: make({ name: 'Caesar Clown', classId: 'class.chemist', level: 3, scores: scores(8, 12, 12, 12, 16, 10), subclass: 'subclass.chemist.aerostatics' },
      (d) => ({ classes: [...d.classes, { id: 'class.oracle', level: 2, subclass: 'subclass.oracle.bones_of_sight' }] })),
    expected: {
      'resource.1st-level slots': 7, // Chemist 3: 4, plus Oracle 2: 3
      'resource.2nd-level slots': 2, // Chemist 3: 2
      hitDice: '3d8 + 2d6',
      maxHp: 31, // 8 + 2 × 5 + 2 × 4 + Con 1 × 5
    },
  },
  {
    id: 'multiclass-two-defenses',
    name: 'Sai',
    version: 'dndf-10',
    checks: 'Two unarmored AC formulas: only the better one applies. Two fighting-style dice: the larger one applies.',
    build: make({ name: 'Sai', classId: 'class.martial_artist', level: 5, scores: scores(13, 16, 16, 8, 14, 8), subclass: 'subclass.martial_artist.six_powers' },
      (d) => ({ classes: [...d.classes, { id: 'class.bruiser', level: 1 }] })),
    expected: {
      level: 6,
      ac: 16, // Offensive Defense 10 + 3 + 3 beats Unarmored Defense 10 + 3 + 2 — EH10 p.210
      speed: 50, // 30 + Unarmored Movement 10 + Offensive Defense 10
      maxHp: 53, // 8 + 4 × 5 + 1 × 7 + Con 3 × 6
      hitDice: '1d12 + 5d8',
      'attack.Unarmed strike.hit': 6, // Dex 3 (Martial Arts allows it) + prof 3
      'attack.Unarmed strike.damage': '1d8 + 3', // Martial Arts d8 at 5th beats Scrapper d4
      attacksPerAction: 2,
      warnings: 0,
    },
  },
  {
    id: 'multiclass-prerequisites',
    name: 'Bartolomeo',
    version: 'dndf-8.8',
    checks: 'Multiclass prerequisites are reported as warnings and never block the sheet.',
    build: make({ name: 'Bartolomeo', rulesVersion: 'dndf-8.8', level: 3, scores: scores(16, 12, 14, 10, 10, 10) },
      (d) => ({ classes: [...d.classes, { id: 'class.skald', level: 1 }, { id: 'class.hybrid', level: 1 }] })),
    expected: {
      level: 5,
      maxHp: 47, // 12 + 2 × 7 (Bruiser 2–3) + 5 (Skald d8) + 6 (Hybrid d10) + Con 2 × 5
      warnings: 2,
    },
    expectedWarnings: ['Skald asks for Charisma 13', 'doesn\'t allow multiclassing into Hybrid'],
  },
  {
    id: 'bruiser-v88',
    name: 'Kaito of the old book',
    version: 'dndf-8.8',
    checks: 'The v8.8 Bruiser gives the same numbers as v10 where the two books print the same text.',
    build: make({ name: 'Kaito of the old book', rulesVersion: 'dndf-8.8', level: 7, scores: scores(18, 14, 16, 8, 12, 10), furyFeatures: ['brace_for_impact'] }),
    expected: {
      maxHp: 75,
      ac: 15,
      speed: 40,
      'attack.Unarmed strike.damage': '1d6 + 4',
      'resource.Fury Points': 4,
      'formula.Fury save DC': 14,
    },
  },
  {
    id: 'exhausted-and-edited',
    name: 'Kaito on a bad day',
    version: 'dndf-10',
    checks: 'Exhaustion changing speed and hit points, and a player\'s own number replacing a calculated one.',
    build: make({ name: 'Kaito on a bad day', level: 7, scores: scores(18, 14, 16, 8, 12, 10) },
      (d) => ({ overrides: { ac: 18 }, state: { ...d.state, exhaustion: 4 } })),
    expected: {
      ac: 18, // the player's own value
      'calculated.ac': 15, // still shown
      speed: 20, // 40 halved at exhaustion 2 and beyond
      maxHp: 37, // 75 halved at exhaustion 4, rounded down
    },
  },
  {
    id: 'strengthen-self',
    name: 'Rayleigh',
    version: 'dndf-10',
    checks: 'Willpower: Strengthen Self adds 2 each, and the total stops at 20.',
    build: make({ name: 'Rayleigh', classId: 'class.warrior', level: 17, scores: scores(18, 14, 14, 12, 14, 14) }, { willpower: { strengthenSelf: 2 } }),
    expected: {
      willpower: 20, // 17 + 4, capped at 20 — EH10 p.221–222
      hakiSaveDc: 20, // 10 + ceil(20 / 2)
      prof: 6,
      attacksPerAction: 3, // Warrior Extra Attack at 11th
      'resource.Action Surge': 2, // twice from 17th
    },
  },
];

const ABILITY_KEYS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Reads one expected value off a sheet. Returns undefined if the sheet has nothing by that key. */
export function readSheet(sheet: Sheet, key: string): number | string | undefined {
  const [kind, ...rest] = key.split('.');
  const name = rest.join('.');
  switch (kind) {
    case 'level': return sheet.level;
    case 'prof': return sheet.prof.value;
    case 'maxHp': return sheet.maxHp.value;
    case 'ac': return sheet.ac.value;
    case 'speed': return sheet.speed.value;
    case 'initiative': return sheet.initiative.value;
    case 'willpower': return sheet.willpower.value;
    case 'hakiSaveDc': return sheet.hakiSaveDc.value;
    case 'passivePerception': return sheet.passivePerception.value;
    case 'carry': return sheet.carry.value;
    case 'attacksPerAction': return sheet.attacksPerAction;
    case 'dreamPoints': return sheet.dreamPoints.max;
    case 'warnings': return sheet.warnings.length;
    case 'proficientSkills': return sheet.skills.filter((s) => s.proficient).length;
    case 'hitDice': return sheet.hitDice.pool.map((p) => `${p.count}d${p.die}`).join(' + ');
    case 'calculated': return name === 'ac' ? sheet.ac.calculated : undefined;
    case 'score': return ABILITY_KEYS.includes(name as Ability) ? sheet.abilities[name as Ability].score : undefined;
    case 'save': return ABILITY_KEYS.includes(name as Ability) ? sheet.saves[name as Ability].value : undefined;
    case 'skill': return sheet.skills.find((s) => s.id === name)?.value;
    case 'resource': return sheet.resources.find((r) => r.name === name)?.max;
    case 'formula': return sheet.formulas.find((f) => f.label === name)?.value;
    case 'attack': {
      const what = rest.at(-1);
      const attack = sheet.attacks.find((a) => a.name === rest.slice(0, -1).join('.'));
      return what === 'hit' ? attack?.toHit.value : attack?.damage;
    }
    case 'tracker': return sheet.trackers.find((t) => t.name === rest.slice(0, -1).join('.'))?.max;
    case 'roll': {
      const index = Number(rest.at(-1));
      return sheet.features.find((f) => f.name === rest.slice(0, -1).join('.'))?.rolls[index]?.dice;
    }
    default: return undefined;
  }
}
