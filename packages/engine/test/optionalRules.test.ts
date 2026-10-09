// The optional rules a campaign's DM switches on: Special Reactions, Haki Purist, Dream Points, Healing Surge.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, NO_CAMPAIGN_SETTINGS, OPTIONAL_RULES, campaignSettings, deriveSheet, healingSurge, newCharacter, shortRest, type CampaignSettings, type CharacterDoc, type OptionalRule, type RulesVersion } from '../src';
import { loadRules } from './load';

const scores = { str: 14, dex: 12, con: 14, int: 10, wis: 12, cha: 10 };

describe('campaign settings as saved', () => {
  it('the four optional rules are off until switched on; a character in no campaign has none', () => {
    expect(campaignSettings({})).toEqual({ hakiAttackRuling: true, longRestHitDice: 'all', specialReactions: false, hakiPurist: false, dreamPoints: false, healingSurge: false });
    expect(NO_CAMPAIGN_SETTINGS).toEqual(campaignSettings({}));
    expect(campaignSettings()).toEqual(campaignSettings({}));
    expect(campaignSettings({ dreamPoints: true, healingSurge: true })).toMatchObject({ dreamPoints: true, healingSurge: true, specialReactions: false, hakiPurist: false });
  });

  it('only a plain true switches one on, and nonsense is read as nothing', () => {
    for (const bad of [null, 'yes', 7, [], [{ dreamPoints: true }], { dreamPoints: 'true' }, { dreamPoints: 1 }]) expect(campaignSettings(bad).dreamPoints, JSON.stringify(bad)).toBe(false);
    expect(campaignSettings({ hakiAttackRuling: false, longRestHitDice: 'half' })).toMatchObject({ hakiAttackRuling: false, longRestHitDice: 'half' });
    expect(campaignSettings({ longRestHitDice: 'none' }).longRestHitDice).toBe('all');
  });

  it('names each rule, where it is printed and what it gives', () => {
    expect(OPTIONAL_RULES.map((r) => r.id)).toEqual(['specialReactions', 'hakiPurist', 'dreamPoints', 'healingSurge']);
    for (const version of ['dndf-10', 'dndf-8.8'] as RulesVersion[]) {
      const rules = loadRules(version);
      for (const rule of OPTIONAL_RULES) {
        const entry = rules.get(rule.rule);
        expect(entry, `${version} ${rule.rule}`).toBeTruthy();
        if (rule.section) expect(((entry!.sections ?? []) as { name: string }[]).some((s) => s.name === rule.section), `${version} ${rule.section}`).toBe(true);
      }
    }
  });
});

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('a sheet under the campaign’s optional rules (%s)', (version) => {
  const rules = loadRules(version);
  const doc: CharacterDoc = { ...newCharacter({ name: 'T', rulesVersion: version, classId: 'class.warrior', level: 10, scores }, rules), hakiPurist: ['quantity', 'stamina'] };
  const only = (...on: OptionalRule[]): CampaignSettings => campaignSettings(Object.fromEntries(on.map((rule) => [rule, true])));
  const all = deriveSheet(doc, rules, DEFAULT_SETTINGS);
  const none = deriveSheet(doc, rules, NO_CAMPAIGN_SETTINGS);
  const pools = (sheet: typeof all) => sheet.resources.map((r) => r.id);

  it('with everything on, all four are there', () => {
    expect(all.optionalRules).toEqual({ specialReactions: true, hakiPurist: true, dreamPoints: true, healingSurge: true });
    expect(all.specialReactions.length).toBeGreaterThanOrEqual(2);
    expect(all.dreamPoints.max).toBeGreaterThan(0);
    expect(all.healingSurgeDice).toBeGreaterThan(0);
    expect(pools(all)).toContain('healing_surge');
    expect(all.haki.purist.earned).toBeGreaterThan(0);
  });

  it('in no campaign, none of the four is on the sheet', () => {
    expect(none.optionalRules).toEqual({ specialReactions: false, hakiPurist: false, dreamPoints: false, healingSurge: false });
    expect(none.specialReactions).toEqual([]);
    expect(pools(none).filter((id) => id.startsWith('sr.') || id === 'healing_surge')).toEqual([]);
    expect(none.dreamPoints).toEqual({ max: 0, remaining: 0 });
    expect(none.healingSurgeDice).toBe(0);
    expect(none.haki.purist).toMatchObject({ earned: 0, picks: [] });
    expect(none.warnings).toEqual(all.warnings);
  });

  it('each switch turns on its own rule and nothing else', () => {
    const reactions = deriveSheet(doc, rules, only('specialReactions'));
    expect(reactions.specialReactions.map((r) => r.name)).toEqual(all.specialReactions.map((r) => r.name));
    expect(pools(reactions).filter((id) => id.startsWith('sr.'))).toEqual(pools(all).filter((id) => id.startsWith('sr.')));
    expect([reactions.dreamPoints.max, reactions.healingSurgeDice, reactions.haki.purist.earned]).toEqual([0, 0, 0]);

    const dreams = deriveSheet(doc, rules, only('dreamPoints'));
    expect(dreams.dreamPoints).toEqual(all.dreamPoints);
    expect([dreams.specialReactions.length, dreams.healingSurgeDice, pools(dreams).includes('healing_surge')]).toEqual([0, 0, false]);

    const surge = deriveSheet(doc, rules, only('healingSurge'));
    expect([surge.healingSurgeDice, pools(surge).includes('healing_surge')]).toEqual([all.healingSurgeDice, true]);
    expect([surge.dreamPoints.max, surge.specialReactions.length]).toEqual([0, 0]);

    const purist = deriveSheet(doc, rules, only('hakiPurist'));
    expect(purist.haki.purist).toEqual(all.haki.purist);
    expect([purist.dreamPoints.max, purist.healingSurgeDice, purist.specialReactions.length]).toEqual([0, 0, 0]);
  });

  it('Haki Purist picks are kept on the character and count for nothing while the rule is off', () => {
    expect(doc.hakiPurist).toEqual(['quantity', 'stamina']);
    expect(all.haki.purist.picks).toEqual(['quantity', 'stamina']);
    expect(none.haki.purist.picks).toEqual([]);
    // Whatever the picks changed with the rule on is as if they had never been made with it off.
    const never = deriveSheet({ ...doc, hakiPurist: undefined }, rules, NO_CAMPAIGN_SETTINGS);
    expect(none.willpower.value).toBe(never.willpower.value);
    expect(none.haki.colors.map((c) => c.count.value)).toEqual(never.haki.colors.map((c) => c.count.value));
    expect(none.resources.map((r) => [r.id, r.max])).toEqual(never.resources.map((r) => [r.id, r.max]));
  });

  it('spent Dream Points and a used Healing Surge are remembered, and are back when the rule is', () => {
    const spent: CharacterDoc = { ...doc, state: { ...doc.state, dreamPointsSpent: 3, spent: { ...doc.state.spent, healing_surge: 1 } } };
    expect(deriveSheet(spent, rules, NO_CAMPAIGN_SETTINGS).dreamPoints).toEqual({ max: 0, remaining: 0 });
    const back = deriveSheet(spent, rules, DEFAULT_SETTINGS);
    expect(back.dreamPoints.remaining).toBe(back.dreamPoints.max - 3);
    expect(back.resources.find((r) => r.id === 'healing_surge')!.remaining).toBe(0);
  });

  it('with Healing Surge off a surge heals nothing and spends nothing; a rest still works', () => {
    const hurt: CharacterDoc = { ...doc, state: { ...doc.state, hp: 5 } };
    const off = deriveSheet(hurt, rules, NO_CAMPAIGN_SETTINGS);
    const tried = healingSurge(hurt, off, [6, 6, 6]);
    expect([tried.state.hp, tried.state.hitDiceSpent]).toEqual([5, 0]);
    const rested = shortRest(hurt, off, { hitDiceRolls: [6] });
    expect(rested.state.hp).toBeGreaterThan(5);
  });

  it('nothing else on the sheet moves with the switches', () => {
    const core = (a: typeof all) => [a.ac.value, a.maxHp.value, a.speed.value, a.initiative.value, a.prof.value, a.attacks.length, a.features.length, a.skills.map((k) => k.value).join()];
    expect(core(none)).toEqual(core(all));
    // …bar what Haki Purist picks themselves change, which is the point of them.
    const noPicks = { ...doc, hakiPurist: undefined };
    expect(deriveSheet(noPicks, rules, NO_CAMPAIGN_SETTINGS).willpower.value).toBe(deriveSheet(noPicks, rules, DEFAULT_SETTINGS).willpower.value);
  });
});
