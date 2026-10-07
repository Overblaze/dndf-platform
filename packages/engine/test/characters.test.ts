// The made-up characters in src/testCharacters.ts, each checked against the numbers worked out
// by hand from the books, plus rules that must hold for any character at all.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, readSheet, TEST_CHARACTERS, type CharacterDoc, type ClassEntry, type RuleEntry, type RulesVersion, type Sheet, type Stat } from '../src';
import { loadRules } from './load';

const rulesFor = { 'dndf-10': loadRules('dndf-10'), 'dndf-8.8': loadRules('dndf-8.8') };

describe('test characters match the books', () => {
  it('has a good spread: every class of both handbooks, and multiclass, feat, race and background builds', () => {
    expect(TEST_CHARACTERS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(TEST_CHARACTERS.map((c) => c.id)).size).toBe(TEST_CHARACTERS.length);
    const classesUsed = new Set(TEST_CHARACTERS.flatMap((c) => c.build(rulesFor[c.version]).classes.map((k) => `${c.version} ${k.id}`)));
    for (const version of ['dndf-10', 'dndf-8.8'] as const) {
      const missing = [...rulesFor[version].values()].filter((e) => e.kind === 'class' && !classesUsed.has(`${version} ${e.id}`) && !classesUsed.has(`${version === 'dndf-10' ? 'dndf-8.8' : 'dndf-10'} ${e.id}`));
      expect(missing.map((e) => e.name), `classes with no test character (${version})`).toEqual([]);
    }
    expect(TEST_CHARACTERS.filter((c) => c.build(rulesFor[c.version]).classes.length > 1).length).toBeGreaterThanOrEqual(5);
  });

  describe.each(TEST_CHARACTERS.map((c) => [c.name, c] as const))('%s', (_name, character) => {
    const rules = rulesFor[character.version];
    const doc = character.build(rules);
    const sheet = deriveSheet(doc, rules);

    it.each(Object.entries(character.expected))('%s = %s', (key, expected) => {
      expect(readSheet(sheet, key), `${character.name}: ${key}`).toBe(expected);
    });

    it('raises no warnings other than the ones it is built to raise', () => {
      for (const words of character.expectedWarnings ?? []) expect(sheet.warnings.some((w) => w.includes(words)), words).toBe(true);
      expect(sheet.warnings).toHaveLength(character.expectedWarnings?.length ?? 0);
    });

    it('starts at full hit points and cites a book for every page it shows', () => {
      expect(doc.state.hp).toBe(sheet.maxHp.value);
      expect(sheet.book).toMatch(character.version === 'dndf-10' ? /v10$/ : /v8\.8$/);
      for (const feature of sheet.features) expect(feature.book.length, feature.name).toBeGreaterThan(3);
      for (const stat of allStats(sheet)) if (stat.page !== undefined) expect(stat.book, stat.label).toBe(sheet.book);
    });
  });
});

function allStats(sheet: Sheet): Stat[] {
  return [
    sheet.prof, sheet.ac, sheet.speed, sheet.initiative, sheet.maxHp, sheet.carry, sheet.willpower, sheet.hakiSaveDc, sheet.passivePerception,
    ...(sheet.hakiAttack ? [sheet.hakiAttack] : []), ...Object.values(sheet.saves), ...sheet.skills, ...sheet.attacks.map((a) => a.toHit), ...sheet.formulas,
  ];
}

// Every character the suite can think of: the hand-built ones, and every class at several levels
// with every subclass, in both handbooks.
function everyCharacter(): { label: string; doc: CharacterDoc; rules: Map<string, RuleEntry> }[] {
  const out = TEST_CHARACTERS.map((c) => ({ label: c.name, doc: c.build(rulesFor[c.version]), rules: rulesFor[c.version] }));
  const scores = { str: 15, dex: 14, con: 13, int: 12, wis: 11, cha: 9 };
  for (const version of ['dndf-10', 'dndf-8.8'] as RulesVersion[]) {
    const rules = rulesFor[version];
    const all = [...rules.values()];
    for (const cls of all.filter((e): e is ClassEntry => e.kind === 'class')) {
      const subs = all.filter((e) => e.kind === 'subclass' && e.parent === cls.id);
      for (const sub of subs) {
        for (const level of [1, 3, 6, 11, 17, 20]) {
          out.push({ label: `${version} ${cls.name} ${level} ${sub.name}`, doc: newCharacter({ name: 'x', rulesVersion: version, classId: cls.id, level, scores, subclass: sub.id }, rules), rules });
        }
      }
    }
  }
  return out;
}

describe('rules that hold for every character', () => {
  const everyone = everyCharacter();

  it('covers more than nine hundred characters', () => {
    expect(everyone.length).toBeGreaterThan(900);
  });

  it('every breakdown adds up to the number it explains', () => {
    for (const { label, doc, rules } of everyone) {
      const sheet = deriveSheet(doc, rules);
      for (const stat of allStats(sheet)) {
        const total = stat.lines.reduce((sum, line) => sum + (typeof line.value === 'number' ? line.value : 0), 0);
        expect(total, `${label}: ${stat.label}`).toBe(stat.calculated);
      }
      // A damage breakdown is the die and then the modifiers that are added to it.
      for (const attack of sheet.attacks) {
        const bonus = attack.damageLines.slice(1).reduce((sum, line) => sum + Number(line.value), 0);
        const shown = /([+-]) (\d+)$/.exec(attack.damage);
        const flat = /^-?\d+$/.test(attack.damage);
        if (!flat) expect(shown ? Number(`${shown[1]}${shown[2]}`) : 0, `${label}: ${attack.name} damage`).toBe(bonus);
      }
    }
  });

  it('hit points are each class\'s dice plus Constitution for every level', () => {
    for (const { label, doc, rules } of everyone) {
      if ((doc.feats ?? []).length || doc.state.exhaustion) continue;
      const sheet = deriveSheet(doc, rules);
      let expected = sheet.abilities.con.mod * sheet.level;
      doc.classes.forEach((picked, index) => {
        const die = (rules.get(picked.id) as ClassEntry).hitDie;
        expected += index === 0 ? die + (picked.level - 1) * (die / 2 + 1) : picked.level * (die / 2 + 1);
      });
      expect(sheet.maxHp.calculated, label).toBe(expected);
      expect(sheet.hitDice.pool.reduce((sum, p) => sum + p.count, 0), label).toBe(sheet.level);
    }
  });

  it('proficiency bonus, Willpower and Dream Points come from total level', () => {
    for (const { label, doc, rules } of everyone) {
      const sheet = deriveSheet(doc, rules);
      const level = doc.classes.reduce((sum, c) => sum + c.level, 0);
      expect(sheet.prof.calculated, label).toBe(2 + Math.floor((level - 1) / 4));
      expect(sheet.dreamPoints.max, label).toBe(level);
      expect(sheet.willpower.calculated, label).toBe(Math.min(20, level + 2 * doc.willpower.strengthenSelf));
      expect(sheet.hakiSaveDc.calculated, label).toBe(10 + Math.ceil(sheet.willpower.value / 2));
    }
  });

  it('two more points in an ability add exactly one wherever its modifier is used', () => {
    for (const { label, doc, rules } of everyone.filter((_, i) => i % 7 === 0)) {
      const before = deriveSheet(doc, rules);
      const after = deriveSheet({ ...doc, scores: { ...doc.scores, wis: doc.scores.wis + 2 } }, rules);
      expect(after.saves.wis.calculated - before.saves.wis.calculated, `${label}: Wisdom save`).toBe(1);
      for (const skill of before.skills.filter((s) => s.ability === 'wis')) {
        expect(after.skills.find((s) => s.id === skill.id)!.calculated - skill.calculated, `${label}: ${skill.label}`).toBe(1);
      }
      expect(after.passivePerception.calculated - before.passivePerception.calculated, `${label}: passive Perception`).toBe(1);
      // Constitution reaches every level's hit points.
      const tougher = deriveSheet({ ...doc, scores: { ...doc.scores, con: doc.scores.con + 2 } }, rules);
      if (!doc.state.exhaustion && before.abilities.con.score + 2 === tougher.abilities.con.score) {
        expect(tougher.maxHp.calculated - before.maxHp.calculated, `${label}: hit points`).toBe(before.level);
      }
    }
  });

  it('a feat adds the same amount to any character: Tough 2 per level, Alert 5, Mobile 10 ft', () => {
    for (const { label, doc, rules } of everyone.filter((_, i) => i % 11 === 0)) {
      if (doc.state.exhaustion || (doc.feats ?? []).length) continue;
      const before = deriveSheet(doc, rules);
      const after = deriveSheet({ ...doc, feats: ['feat.tough', 'feat.alert', 'feat.mobile'] }, rules);
      expect(after.maxHp.calculated - before.maxHp.calculated, `${label}: Tough`).toBe(2 * before.level);
      expect(after.initiative.calculated - before.initiative.calculated, `${label}: Alert`).toBe(5);
      expect(after.speed.calculated - before.speed.calculated, `${label}: Mobile`).toBe(10);
      expect(after.warnings, label).toEqual(before.warnings);
    }
  });

  it('a player\'s own number replaces the shown value and leaves the calculated one alone', () => {
    for (const { label, doc, rules } of everyone.filter((_, i) => i % 13 === 0)) {
      const before = deriveSheet(doc, rules);
      const after = deriveSheet({ ...doc, overrides: { ...doc.overrides, speed: 5, 'skill.stealth': 30 } }, rules);
      expect(after.speed, label).toMatchObject({ value: 5, calculated: before.speed.calculated, overridden: true });
      expect(after.skills.find((s) => s.id === 'stealth'), label).toMatchObject({ value: 30, calculated: before.skills.find((s) => s.id === 'stealth')!.calculated });
      expect(after.ac.value, label).toBe(before.ac.value);
    }
  });

  it('every limited use is a whole number above zero, and every dice button is rollable dice', () => {
    for (const { label, doc, rules } of everyone) {
      const sheet = deriveSheet(doc, rules);
      for (const resource of sheet.resources) expect(Number.isInteger(resource.max) && resource.max > 0, `${label}: ${resource.name}`).toBe(true);
      for (const feature of sheet.features) for (const roll of feature.rolls) expect(roll.dice, `${label}: ${feature.name}`).toMatch(/^(\d+d\d+( [+-] \d+d\d+)*( [+-] \d+)?|\d+)$/);
      expect(new Set(sheet.resources.map((r) => r.id)).size, `${label}: one pool per id`).toBe(sheet.resources.length);
    }
  });
});

describe('multiclass prerequisites (EH10 p.209, EH8.8 p.208)', () => {
  it.each(['dndf-10', 'dndf-8.8'] as const)('%s: reads the handbook\'s table and warns without blocking', (version) => {
    const rules = rulesFor[version];
    const build = (scores: Record<string, number>, second: string) => {
      const doc = newCharacter({ name: 'x', rulesVersion: version, level: 3, scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...scores } }, rules);
      return deriveSheet({ ...doc, classes: [...doc.classes, { id: second, level: 1 }] }, rules);
    };
    // Bruiser needs Strength 13 and Constitution 13; Warrior needs Strength 13 or Dexterity 13.
    expect(build({ str: 13, con: 13 }, 'class.warrior').warnings).toEqual([]);
    expect(build({ str: 13, con: 12 }, 'class.warrior').warnings).toHaveLength(1);
    expect(build({ str: 13, con: 12 }, 'class.warrior').warnings[0]).toMatch(/Bruiser asks for Strength 13 and Constitution 13\. \(EH(10 p\.209|8\.8 p\.208)\)/);
    expect(build({ str: 12, dex: 13, con: 13 }, 'class.warrior').warnings).toHaveLength(1); // Bruiser unmet, Warrior met through Dexterity
    expect(build({ str: 13, con: 13 }, 'class.hybrid').warnings[0]).toMatch(/doesn't allow multiclassing into Hybrid/);
    // A single class never warns, whatever the scores.
    expect(deriveSheet(newCharacter({ name: 'x', rulesVersion: version, level: 3, scores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } }, rules), rules).warnings).toEqual([]);
    // The sheet is still fully worked out.
    expect(build({ str: 8, con: 8 }, 'class.warrior').maxHp.value).toBeGreaterThan(0);
  });
});

describe('every feat, race, background and crew role can be put on a character', () => {
  it.each(['dndf-10', 'dndf-8.8'] as const)('%s', (version) => {
    const rules = rulesFor[version];
    const all = [...rules.values()];
    const scores = { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 };
    const plain = deriveSheet(newCharacter({ name: 'x', rulesVersion: version, classId: 'class.warrior', level: 5, scores }, rules), rules);
    for (const feat of all.filter((e) => e.kind === 'feat')) {
      const sheet = deriveSheet(newCharacter({ name: 'x', rulesVersion: version, classId: 'class.warrior', level: 5, scores, feats: [feat.id] }, rules), rules);
      expect(sheet.warnings, feat.name).toEqual([]);
      expect(sheet.features.some((f) => f.name === feat.name && f.from === 'Feat'), feat.name).toBe(true);
      // A feat's granted skills show up as proficiencies.
      for (const skill of (feat.skills ?? []) as string[]) expect(sheet.skills.find((s) => s.id === skill)!.proficient, `${feat.name}: ${skill}`).toBe(true);
      expect(sheet.maxHp.calculated - plain.maxHp.calculated, feat.name).toBe(feat.name === 'Tough' ? 10 : 0);
    }
    for (const race of all.filter((e) => e.kind === 'race')) {
      const subs = all.filter((e) => e.kind === 'subrace' && e.parent === race.id);
      for (const sub of subs.length ? subs : [undefined]) {
        const sheet = deriveSheet(newCharacter({ name: 'x', rulesVersion: version, classId: 'class.warrior', level: 5, scores, raceId: race.id, subraceId: sub?.id }, rules), rules);
        expect(sheet.warnings, `${race.name} ${sub?.name ?? ''}`).toEqual([]);
        expect(sheet.carry.calculated % 210, `${race.name} ${sub?.name ?? ''}: carrying is Str 14 × 15, doubled per size step`).toBe(0);
      }
    }
    for (const background of all.filter((e) => e.kind === 'background')) {
      for (const role of all.filter((e) => e.kind === 'crewRole').slice(0, 3)) {
        const sheet = deriveSheet(newCharacter({ name: 'x', rulesVersion: version, classId: 'class.warrior', level: 5, scores, backgroundId: background.id, crewRoleId: role.id }, rules), rules);
        const granted = new Set([...(background.skills as string[]), ...((role.skills ?? []) as string[])]);
        expect(sheet.skills.filter((s) => s.proficient).map((s) => s.id).sort(), `${background.name} + ${role.name}`).toEqual([...granted].sort());
        // Proficient skills are ability + 3 at 5th level; the rest are the bare ability modifier.
        for (const skill of sheet.skills) expect(skill.calculated, `${background.name}: ${skill.label}`).toBe(2 + (skill.proficient ? 3 : 0));
      }
    }
  });
});
