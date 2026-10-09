// /surge, checked against the same engine and rules data as the website's "+ Spirit Surge" dialog.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, normalizeDoc, type CharacterDoc, type RuleEntry } from '@dndf/engine';
import { loadRules } from '../../packages/engine/test/load';
import { COMMANDS } from '../src/slash';
import { surgeAdd, surgeChoices, surgeList, surgeMatches, surgeRemove } from '../src/surgeCommands';

const rules = loadRules('dndf-10');
const base = newCharacter({ name: 'Zoro', rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: ['athletics'] }, rules);
const resheet = (doc: CharacterDoc) => deriveSheet(doc, rules);
const DAY = '2026-10-09';
const add = (doc: CharacterDoc, input: Parameters<typeof surgeAdd>[3]) => surgeAdd(doc, resheet(doc), rules, input, DAY, resheet);

describe('/surge add', () => {
  it('a Haki feature: recorded with the surge’s rarity and reason, and the sheet’s change is said', () => {
    const before = resheet(base);
    const out = add(base, { rarity: 'Uncommon', advancement: 'aura of life', reason: 'Stood against the Sea King', session: '12' });
    expect(out.doc!.surges).toEqual([{ id: 'surge-1', entry: 'hakiFeature.aura_of_life', rarity: 'Uncommon', at: DAY, reason: 'Stood against the Sea King', session: '12' }]);
    const lines = out.reply.split('\n');
    expect(lines[0]).toBe('✨ **Zoro** — Uncommon Spirit Surge: **Aura of Life**');
    expect(lines[1]).toMatch(/^Uncommon Haki feature · EH10 p\.\d+ · Stood against the Sea King$/);
    expect(lines.at(-1)).toBe('The full text is on the website’s Haki tab.');
    expect(out.log).toBe('Uncommon Spirit Surge (Discord): Aura of Life');
    const after = resheet(out.doc!);
    expect(after.haki.colors.find((c) => c.id === 'armament')).toMatchObject({ tier: 1 });
    expect(after.haki.colors.find((c) => c.id === 'armament')!.count.value).toBe(before.haki.colors.find((c) => c.id === 'armament')!.count.value + 1);
    expect(after.features.some((f) => f.name === 'Aura of Life')).toBe(true);
    // Exactly what the website saves, and reads back.
    expect(normalizeDoc(JSON.parse(JSON.stringify(out.doc)))!.surges).toEqual(out.doc!.surges);
  });

  it('Strengthen Self asks what to raise before anything is saved; Willpower 8 → 10 moves the Haki save DC', () => {
    const ask = add(base, { rarity: 'Common', advancement: 'Strengthen Self' });
    expect(ask.doc).toBeUndefined();
    expect(ask.reply).toBe('**Strengthen Self** leaves a choice open. Run it again with `choice`: the ability score to raise by 2, or Willpower.');
    const before = resheet(base);
    const will = add(base, { rarity: 'Common', advancement: 'strengthen', choice: 'willpower' });
    expect(will.reply.split('\n')[0]).toBe('✨ **Zoro** — Common Spirit Surge: **Strengthen Self** (Willpower)');
    const after = resheet(will.doc!);
    expect(after.willpower.value).toBe(before.willpower.value + 2);
    expect(will.reply).toContain(`Willpower: ${before.willpower.value} → ${after.willpower.value}`);
    const str = add(base, { rarity: 'Common', advancement: 'Strengthen Self', choice: 'str' });
    expect(resheet(str.doc!).abilities.str.score).toBe(18);
    expect(str.doc!.surges![0]!.pick).toEqual({ ability: 'str' });
    expect(str.doc!.scores.str).toBe(16); // worked out on the sheet, not written into the scores
  });

  it('Career Advancement asks for the skill: proficiency, or expertise if already proficient', () => {
    expect(add(base, { rarity: 'Common', advancement: 'Career Advancement' }).reply).toContain('`skill`: the skill to gain');
    const stealth = add(base, { rarity: 'Common', advancement: 'Career Advancement', skill: 'stealth' });
    expect(resheet(stealth.doc!).skills.find((k) => k.id === 'stealth')).toMatchObject({ proficient: true, expertise: false });
    const athletics = add(base, { rarity: 'Common', advancement: 'Career Advancement', skill: 'athletics' });
    expect(resheet(athletics.doc!).skills.find((k) => k.id === 'athletics')).toMatchObject({ proficient: true, expertise: true });
    expect(athletics.reply.split('\n')[0]).toBe('✨ **Zoro** — Common Spirit Surge: **Career Advancement** (Athletics)');
  });

  it('one the rules would hold back is added anyway, with the reason said', () => {
    const options = surgeChoices(base, resheet(base), rules, 'Common');
    const held = options.find((o) => o.blocked.some((b) => /Needs a (Rare|Very Rare|Legendary) Spirit Surge/.test(b)) && o.entry.kind === 'hakiFeature' && o.blocked.length === 1)!;
    const out = add(base, { rarity: 'Common', advancement: held.entry.id });
    expect(out.doc!.surges).toHaveLength(1);
    expect(out.reply).toMatch(/⚠️ The rules would not offer this now: needs a (rare|very rare|legendary) spirit surge\. It was added anyway; that is your DM’s call\./i);
  });

  it('asks which, or says there is none; a Devil Fruit advancement is never offered or added here', () => {
    expect(add(base, { rarity: 'Rare', advancement: 'zzz' }).reply).toMatch(/No advancement in .* is called "zzz"/);
    const many = add(base, { rarity: 'Legendary', advancement: 'a' });
    expect(many.doc).toBeUndefined();
    expect(many.reply).toMatch(/^"a" could be: .*\. Which one\?$/);
    expect(add(base, { rarity: 'Mythic', advancement: 'Aura of Life' }).reply).toMatch(/not a Spirit Surge rarity/);
    // With a private advancement in the rules in hand (as a fruit holder's sheet has), the bot still leaves it out.
    const secret: RuleEntry = { id: 'fruitAdvancement.hidden_power', kind: 'fruitAdvancement', name: 'Hidden-Power-Name', versions: ['dndf-10'], source: { book: 'Secret', page: 1 }, rarity: 'Rare' } as unknown as RuleEntry;
    const withSecret = new Map(rules).set(secret.id, secret);
    expect(surgeChoices(base, resheet(base), withSecret, 'Legendary').some((o) => o.entry.kind === 'fruitAdvancement')).toBe(false);
    const tried = surgeAdd(base, resheet(base), withSecret, { rarity: 'Rare', advancement: 'fruitAdvancement.hidden_power' }, DAY, resheet);
    expect(tried.doc).toBeUndefined();
    expect(tried.reply).not.toContain('Hidden-Power-Name');
    expect(tried.reply).toMatch(/added on the website/);
    expect(JSON.stringify(surgeMatches(surgeChoices(base, resheet(base), withSecret, 'Legendary'), 'hidden'))).toBe('[]');
  });

  it('the list offered as a player types: what fits, the ones the rules offer now first', () => {
    const offered = surgeMatches(surgeChoices(base, resheet(base), rules, 'Uncommon'), 'a');
    expect(offered.length).toBe(25);
    expect(offered.every((o) => /^(hakiFeature|surgeAdvancement)\./.test(o.value) && o.name.length <= 100)).toBe(true);
    const firstHeld = offered.findIndex((o) => o.name.endsWith('held back'));
    if (firstHeld >= 0) expect(offered.slice(firstHeld).every((o) => o.name.endsWith('held back'))).toBe(true);
    expect(surgeMatches(surgeChoices(base, resheet(base), rules, 'Uncommon'), 'aura of life')[0]).toEqual({ name: 'Aura of Life · Uncommon', value: 'hakiFeature.aura_of_life' });
  });
});

describe('/surge list and remove', () => {
  const stocked = () => {
    let doc = add(base, { rarity: 'Uncommon', advancement: 'Aura of Life', reason: 'Sea King' }).doc!;
    doc = add(doc, { rarity: 'Common', advancement: 'Strengthen Self', choice: 'willpower' }).doc!;
    doc = add(doc, { rarity: 'Common', advancement: 'Strengthen Self', choice: 'str' }).doc!;
    return doc;
  };

  it('lists Haki by Color and each advancement with what was chosen', () => {
    // A level 5 character with no fruit has earned a Haki Purist pick, which is made on the website.
    expect(surgeList(resheet(base)).reply.split('\n')).toEqual([expect.stringMatching(/^✨ \*\*Zoro\*\* — Willpower \d+ · Haki save DC \d+$/), 'No Spirit Surge advancements yet. `/surge add` records one.', 'Haki Purist: 0 of 1 pick made (on the website’s Haki tab).']);
    const lines = surgeList(resheet(stocked())).reply.split('\n');
    expect(lines).toContain('**Color of Armament** — Tier 1 (1 feature; Tier 2 at 4)');
    expect(lines.some((l) => /^• \*\*Aura of Life\*\* — Uncommon · Sea King · EH10 p\.\d+$/.test(l))).toBe(true);
    expect(lines.some((l) => /^• \*\*Strengthen Self\*\* \(Willpower\) — /.test(l))).toBe(true);
    expect(lines.some((l) => /^• \*\*Strengthen Self\*\* \(Strength\) — /.test(l))).toBe(true);
  });

  it('remove takes the most recent one of that name off and says what the sheet loses', () => {
    const doc = stocked();
    const out = surgeRemove(doc, resheet(doc), 'strengthen', resheet);
    expect(out.reply.split('\n')[0]).toBe('↩️ **Zoro** no longer has **Strengthen Self** (the most recent of 2).');
    expect(out.reply).toContain('Strength: 18 → 16');
    expect(out.doc!.surges!.map((r) => r.pick ?? null)).toEqual([null, { willpower: true }]);
    expect(surgeRemove(doc, resheet(doc), 'nothing', resheet).reply).toBe('**Zoro** has no advancement called "nothing". Theirs: Aura of Life, Strengthen Self.');
    expect(surgeRemove(base, resheet(base), 'x', resheet).doc).toBeUndefined();
  });
});

describe('/surge as Discord is told it', () => {
  it('has list, add and remove, and offers only rarities the engine knows', () => {
    const surge = COMMANDS.find((c) => c.name === 'surge')!;
    expect(surge.options!.map((o) => o.name)).toEqual(['list', 'add', 'remove']);
    const addOptions = (surge.options!.find((o) => o.name === 'add') as unknown as { options: { name: string; required?: boolean; choices?: { value: string }[] }[] }).options;
    expect(addOptions.find((o) => o.name === 'rarity')!.choices!.map((c) => c.value)).toEqual(['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary']);
    expect(addOptions.filter((o) => o.required).map((o) => o.name)).toEqual(['rarity', 'advancement']);
    expect(addOptions.length).toBeLessThanOrEqual(25);
  });
});
