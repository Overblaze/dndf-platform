// The bot's commands, checked against the same engine and rules data as the website.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, deriveSheet, newCharacter, spendResource, type CharacterDoc, type Rng, type RuleEntry, type Secrets } from '@dndf/engine';
import { loadRules } from '../../packages/engine/test/load';
import { dawnCommand, findRollable, hp, partyLine, rest, roll, status, withPrivacy } from '../src/commands';

const rules = loadRules('dndf-10');
const scores = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const make = (more: Partial<CharacterDoc> = {}) => {
  const base = newCharacter({ name: 'Zoro', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores, skills: ['athletics', 'perception'] }, rules);
  const doc = { ...base, ...more };
  const sheet = deriveSheet(doc, rules);
  return { doc: more.state ? doc : { ...doc, state: { ...doc.state, hp: sheet.maxHp.value } }, sheet };
};
/** Dice that come up as listed, in order. */
const faces = (sides: number, ...list: number[]): Rng => { let i = 0; return () => (list[i++ % list.length]! - 1) / sides + 0.001; };

describe('/roll', () => {
  const { sheet } = make();

  it('finds what the player meant: a skill, a save, a short ability name, an attack', () => {
    expect(findRollable(sheet, 'athletics').found).toMatchObject({ name: 'Athletics', bonus: 3 + 3 });
    expect(findRollable(sheet, 'ATH').found?.name).toBe('Athletics');
    expect(findRollable(sheet, 'dex save').found).toMatchObject({ name: 'Dexterity save', kind: 'save' });
    expect(findRollable(sheet, 'str').found).toMatchObject({ name: 'Strength check', bonus: 3 });
    expect(findRollable(sheet, 'strength saving throw').found?.name).toBe('Strength save');
    expect(findRollable(sheet, 'initiative').found?.bonus).toBe(2);
    expect(findRollable(sheet, 'unarmed').found?.kind).toBe('attack');
  });

  it('asks which one when the words fit several, and says so when they fit nothing', () => {
    const s = findRollable(sheet, 's');
    expect(s.found).toBeUndefined();
    expect(s.close.length).toBeGreaterThan(1);
    expect(roll(sheet, 's', 'normal', faces(20, 10)).reply).toMatch(/could be: .+Which one\?/);
    expect(roll(sheet, 'cooking', 'normal', faces(20, 10)).reply).toMatch(/Nothing on Zoro's sheet is called "cooking"/);
  });

  it('a skill check: d20 12 + Athletics 6 = 18; with advantage the higher die counts', () => {
    expect(roll(sheet, 'athletics', 'normal', faces(20, 12)).reply).toBe('🎲 **Zoro** · Athletics: **18**  (12 +6)');
    expect(roll(sheet, 'athletics', 'advantage', faces(20, 4, 17)).reply).toBe('🎲 **Zoro** · Athletics: **23**  (4, 17 → 17, advantage +6)');
    expect(roll(sheet, 'athletics', 'disadvantage', faces(20, 4, 17)).reply).toContain('**10**');
    expect(roll(sheet, 'athletics', 'normal', faces(20, 20)).reply).toContain('natural 20!');
  });

  it('an attack also rolls its damage, and doubles the dice on a natural 20', () => {
    const attack = sheet.attacks[0]!;
    const hit = roll(sheet, attack.name, 'normal', faces(20, 10)).reply.split('\n');
    expect(hit[0]).toBe(`🎲 **Zoro** · ${attack.name}: **${10 + attack.toHit.value}**  (10 ${attack.toHit.value >= 0 ? '+' : ''}${attack.toHit.value})`);
    expect(hit[1]).toMatch(/On a hit: \*\*\d+\*\* bludgeoning/);
    expect(roll(sheet, attack.name, 'normal', () => 0.999).reply).toContain('dice doubled');
  });

  it('plain dice: 2d6+3 with a 4 and a 5 is 12; nonsense is refused politely', () => {
    expect(roll(sheet, '2d6+3', 'normal', faces(6, 4, 5)).reply).toBe('🎲 **Zoro** rolls 2d6 + 3: **12**  (4, 5 +3)');
    expect(roll(sheet, 'd20', 'normal', faces(20, 7)).reply).toContain('**7**');
    expect(roll(sheet, '2d', 'normal', faces(6, 1)).reply).toMatch(/Nothing on Zoro's sheet|I can't roll/);
  });
});

describe('/hp', () => {
  it('damage comes off temporary hit points first and stops at 0; healing stops at the maximum', () => {
    const { doc, sheet } = make();
    const max = sheet.maxHp.value; // 10 + 4 × 6 + 2 × 5 = 44
    expect(max).toBe(44);
    const hurt = hp(doc, sheet, 'damage', 10);
    expect(hurt.doc!.state.hp).toBe(34);
    expect(hurt.reply).toBe('💥 **Zoro** takes 10 damage: 44 / 44 → **34 / 44**.');
    expect(hurt.log).toBe('Damage 10 (Discord): HP 44 → 34');
    const shielded = hp(hp(doc, sheet, 'temp', 5).doc!, sheet, 'damage', 8).doc!;
    expect([shielded.state.tempHp, shielded.state.hp]).toEqual([0, 41]);
    expect(hp(hurt.doc!, sheet, 'heal', 99).doc!.state.hp).toBe(44);
    expect(hp(doc, sheet, 'damage', 500).reply).toContain('Down at 0 hit points');
    expect(hp(doc, sheet, 'damage', 0).doc).toBeUndefined();
  });
});

describe('/rest and /dawn', () => {
  it('a short rest spends hit dice rolled by the bot: two d10s of 7 and 3, + Con 2 each, heal 14', () => {
    const { doc, sheet } = make();
    const hurt = { ...doc, state: { ...doc.state, hp: 20 } };
    const rested = rest(hurt, deriveSheet(hurt, rules), 'short', 2, faces(10, 7, 3));
    expect(rested.doc!.state.hp).toBe(34);
    expect(rested.reply).toContain('spending 2 hit dice (rolled 7, 3)');
    expect(deriveSheet(rested.doc!, rules).hitDice.remaining).toBe(sheet.hitDice.total - 2);
    expect(rested.log).toMatch(/^Short rest \(Discord\): /);
  });

  it('asking for more hit dice than are left spends what there is and says so', () => {
    const { doc, sheet } = make();
    const out = rest({ ...doc, state: { ...doc.state, hp: 1 } }, sheet, 'short', 99, faces(10, 5));
    expect(out.reply).toContain(`Only ${sheet.hitDice.remaining} hit dice left`);
  });

  it('a long rest returns hit points and every hit die (table ruling); dawn replies even with nothing to do', () => {
    const { doc } = make();
    const worn = { ...doc, state: { ...doc.state, hp: 5, hitDiceSpent: 4 } };
    const out = rest(worn, deriveSheet(worn, rules), 'long', 0, faces(10, 1));
    expect(out.doc!.state.hp).toBe(44);
    expect(deriveSheet(out.doc!, rules).hitDice.remaining).toBe(5);
    expect(dawnCommand(doc, deriveSheet(doc, rules)).reply).toMatch(/^🌅 Dawn for \*\*Zoro\*\*\./);
  });
});

describe('/status and /party', () => {
  it('status shows hit points, AC, speed, pools and what is switched on', () => {
    const { doc, sheet } = make();
    const text = status(doc, sheet).reply;
    expect(text).toContain('**Zoro** — ');
    expect(text).toContain(`❤️ 44 / 44 · 🛡️ AC ${sheet.ac.value} · 👟 ${sheet.speed.value} ft`);
    expect(text).toContain('Hit dice 5/5');
    expect(text).toMatch(/Second Wind \d\/\d/);
    expect(text).not.toContain('Conditions:');
    expect(status({ ...doc, state: { ...doc.state, conditions: ['Prone'], exhaustion: 2 } }, sheet).reply).toContain('Conditions: Prone\nExhaustion 2');
  });

  it('a party line marks who is hurt and who is down', () => {
    const { doc, sheet } = make();
    expect(partyLine(doc, sheet, 'matt')).toMatch(/^❤️ \*\*Zoro\*\* \(matt\) — .*Warrior 5 · HP 44 \/ 44 · AC \d+$/);
    expect(partyLine({ ...doc, state: { ...doc.state, hp: 20 } }, sheet)).toMatch(/^🩸/);
    expect(partyLine({ ...doc, state: { ...doc.state, hp: 0 } }, sheet)).toMatch(/^💀/);
  });
});

describe('a secret Devil Fruit and what the bot says in front of the table', () => {
  // A made-up fruit: no private content is in the repository.
  const entry = { id: 'devilFruit.test', kind: 'devilFruit', name: 'Stand-in Pear', versions: [], source: { book: 'Test Book', page: 1 }, rarity: 'Rare', type: 'Paramecia', features: [] } as unknown as RuleEntry;
  const secrets: Secrets = { granted: [{ key: 'k', kind: 'owner', revealed: false, entry }], advancements: [] };
  const { doc: fresh } = make();
  const whole0 = deriveSheet(fresh, rules, DEFAULT_SETTINGS, secrets);
  const doc = { ...fresh, state: spendResource(fresh.state, whole0, 'fruit.charges', 3).state };
  const whole = deriveSheet(doc, rules, DEFAULT_SETTINGS, secrets);
  const plain = deriveSheet(doc, rules);

  it('/dawn refills the charges either way, but only names them when the reply is private or the fruit is revealed', () => {
    const inPublic = withPrivacy((sheet) => dawnCommand(doc, sheet), whole, plain, false, Math.random);
    expect(inPublic.doc!.state.spent['fruit.charges']).toBeUndefined();
    expect(inPublic.reply).not.toMatch(/fruit|charges/i);
    expect(inPublic.reply).toContain('Nothing to change');
    const inPrivate = withPrivacy((sheet) => dawnCommand(doc, sheet), whole, plain, true, Math.random);
    expect(inPrivate.reply).toContain('Devil Fruit charges 2 → 5 of 5');
    expect(inPrivate.doc).toEqual(inPublic.doc);
  });

  it('/status in public lists no fruit charges; in private it does', () => {
    expect(withPrivacy((sheet) => status(doc, sheet), whole, plain, false, Math.random).reply).not.toMatch(/fruit/i);
    expect(withPrivacy((sheet) => status(doc, sheet), whole, plain, true, Math.random).reply).toContain('Devil Fruit charges 2/5');
  });

  it('a short rest shows the same dice in the public reply as were really rolled and saved', () => {
    const hurt = { ...doc, state: { ...doc.state, hp: 5 } };
    const out = withPrivacy((sheet, dice) => rest(hurt, sheet, 'short', 2, dice), deriveSheet(hurt, rules, DEFAULT_SETTINGS, secrets), deriveSheet(hurt, rules), false, faces(10, 7, 3));
    expect(out.reply).toContain('rolled 7, 3');
    expect(out.doc!.state.hp).toBe(5 + 7 + 3 + 2 * 2);
    expect(out.reply).toContain(`→ ${out.doc!.state.hp}`);
  });
});

describe('/status with gear and spells', () => {
  it('shows berries, weight carried and prepared spells when there are any, and nothing extra when there are none', () => {
    const plain = make();
    expect(status(plain.doc, plain.sheet).reply).not.toMatch(/฿|Prepared/);
    const { doc, sheet } = make({ money: 1250000, inventory: [{ id: 'a', name: 'Chest', qty: 1, weight: 300 }], spells: [{ id: 's', name: 'Bless', level: 1, prepared: true }, { id: 't', name: 'Guidance', level: 0 }] });
    const reply = status(doc, sheet).reply;
    expect(reply).toContain('฿1,250,000 · carrying 300 of 240 lb (over)');
    expect(reply).toContain('Prepared: Bless');
  });
});
