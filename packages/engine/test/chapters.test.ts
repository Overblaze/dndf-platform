// Chapters 1 and 2 of the v10 handbook: general rules, crew roles, backgrounds, feats and races,
// and what the sheet does with them.
import { describe, expect, it } from 'vitest';
import { deriveSheet, newCharacter, spendResource, type RuleEntry, type SectionDef, type TraitDef } from '../src';
import { loadRules } from './load';

const rules = loadRules('dndf-10');
const all = [...rules.values()];
const ofKind = (kind: string) => all.filter((e) => e.kind === kind);
const scores = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
const kaito = (extra: Parameters<typeof newCharacter>[0] | object = {}) =>
  newCharacter({ name: 'Kaito', level: 7, scores, subclass: 'subclass.bruiser.black_fist', skills: ['athletics', 'intimidation', 'perception'], ...extra }, rules);

describe('chapters 1 and 2 data', () => {
  it('has the crew roles, backgrounds, feats and races of the book', () => {
    expect(ofKind('crewRole').map((e) => e.name)).toEqual([
      'Captain', 'First Mate', 'Navigator', 'Doctor', 'Chef', 'Shipwright', 'Musician', 'Lookout', 'Helmsman', 'Record-Keeper', 'Artillerist', 'Cabin Boy',
    ]);
    expect(ofKind('background')).toHaveLength(31);
    expect(ofKind('feat')).toHaveLength(117);
    expect(ofKind('race').filter((r) => !r.optional).map((r) => r.name)).toEqual(['Human', 'Fishman', 'Merfolk', 'Sky Islander', 'Mink', 'Yokai Tribesman']);
    expect(ofKind('race').filter((r) => r.optional)).toHaveLength(10);
    expect(ofKind('subrace')).toHaveLength(29);
  });

  it('gives every crew role a feature and a Pirate Prestige ability, and every background a feature', () => {
    for (const role of ofKind('crewRole')) {
      const names = (role.sections as SectionDef[]).map((s) => s.name);
      expect(names.filter((n) => n.startsWith('Feature: ')), role.name).toHaveLength(1);
      expect(names.filter((n) => n.startsWith('Pirate Prestige Ability: ')), role.name).toHaveLength(1);
    }
    for (const background of ofKind('background')) {
      expect((background.sections as SectionDef[]).some((s) => s.name.startsWith('Feature: ')), background.name).toBe(true);
      expect(background.skills, background.name).toHaveLength(2);
      expect(String(background.equipment).length, background.name).toBeGreaterThan(20);
    }
  });

  it('gives every race a walking speed, from the race or from each of its subraces', () => {
    for (const race of ofKind('race')) {
      const subs = ofKind('subrace').filter((s) => s.parent === race.id);
      expect(typeof race.speed === 'number' || (subs.length > 0 && subs.every((s) => typeof s.speed === 'number')), race.name).toBe(true);
      for (const trait of race.traits as TraitDef[]) expect(trait.text.length, `${race.name}: ${trait.name}`).toBeGreaterThan(10);
    }
  });

  it('keeps text and a page on every feat, with prerequisites apart from the text', () => {
    for (const feat of ofKind('feat')) {
      expect(String(feat.text).length, feat.name).toBeGreaterThan(40);
      expect(String(feat.text), feat.name).not.toMatch(/^Prerequisite/);
      expect(feat.source.page).toBeGreaterThanOrEqual(52);
      expect(feat.source.page).toBeLessThanOrEqual(65);
    }
    expect(rules.get('feat.abyssal_lure')!.prerequisite).toBe('Merfolk');
    expect(rules.get('feat.alert')!.prerequisite).toBeUndefined();
  });

  it('has the universal features and the five Special Reactions, word for word', () => {
    const reactions = (rules.get('rule.special_reactions')!.sections as SectionDef[]).map((s) => s.name);
    expect(reactions).toEqual(['Counter Strike', 'Deflect Projectile', 'Flash Step', 'Parry Blow', 'Shield Bash']);
    const universal = rules.get('rule.universal_features')!.sections as SectionDef[];
    expect(universal.map((s) => s.name)).toEqual(['Dream Points', 'I Won’t Abandon My Dreams', 'Healing Surge']);
    expect(universal[1]!.text).toContain('roll a d20, on a 12 or higher');
  });

  it('has no Devil Fruit entries and nothing from the secret pages of the v10 book', () => {
    expect(all.filter((e: RuleEntry) => e.kind === 'devilFruit')).toEqual([]);
    // Secret: Devil Fruit advancements (237–240), fruit generation tables (250–254), the DM-only chapter (305 on).
    const secret = (page: number) => (page >= 237 && page <= 240) || (page >= 250 && page <= 254) || page >= 305;
    const pages = (value: unknown): number[] =>
      Array.isArray(value) ? value.flatMap(pages) : value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => (k === 'sources' ? [] : k === 'page' && typeof v === 'number' ? [v] : pages(v))) : [];
    // The page ranges are the v10 handbook's. Text from the System Reference Document has that document's own page numbers.
    for (const entry of all.filter((e: RuleEntry) => e.source.book !== '5e SRD 5.1')) expect(pages(entry).filter(secret), entry.id).toEqual([]);
    // And nothing from the SRD is filed under the handbook's name, which would slip past the line above.
    expect(all.filter((e: RuleEntry) => e.source.book === '5e SRD 5.1').every((e: RuleEntry) => e.kind === 'spell' || e.id === 'rule.srd_conditions')).toBe(true);
  });
});

describe('the sheet with a race, background, crew role and feats', () => {
  it('lists all five Special Reactions, each usable proficiency-bonus times, with a roll where the rule has one', () => {
    const sheet = deriveSheet(kaito(), rules);
    expect(sheet.specialReactions.map((r) => [r.id, r.name, r.roll])).toEqual([
      ['counter', 'Counter Strike', undefined],
      ['deflect', 'Deflect Projectile', '1d10 + 7'],
      ['flash', 'Flash Step', undefined],
      ['parry', 'Parry Blow', '1d10 + 7'],
      ['shield', 'Shield Bash', undefined],
    ]);
    expect(sheet.resources.filter((r) => r.id.startsWith('sr.')).map((r) => r.max)).toEqual([3, 3, 3, 3, 3]);
    expect(sheet.specialReactions[0]!.text).toMatch(/^When an enemy misses an attack/);
    expect(Object.keys(sheet.generalRules)).toEqual(['Dream Points', 'I Won’t Abandon My Dreams', 'Healing Surge']);
  });

  it('adds the background\'s and crew role\'s skills and features', () => {
    const doc = kaito({ backgroundId: 'background.salvager', crewRoleId: 'crewRole.shipwright' });
    const sheet = deriveSheet(doc, rules);
    const proficient = sheet.skills.filter((s) => s.proficient).map((s) => s.id);
    expect(proficient).toEqual(expect.arrayContaining(['investigation', 'perception', 'athletics', 'persuasion']));
    const names = sheet.features.map((f) => `${f.from} / ${f.name}`);
    expect(names).toContain('Background: Salvager / Ship Salvager');
    expect(names).toContain('Crew role: Shipwright / Ship Building, Upgrading, and Repairing');
    expect(names).toContain('Crew role: Shipwright (Pirate Prestige) / Defensive Coating');
    expect(sheet.warnings).toEqual([]);
  });

  it('shows racial traits and applies "counts as one size larger" to carrying', () => {
    const giant = deriveSheet(kaito({ raceId: 'race.human', subraceId: 'subrace.human.giant', raceName: 'Human (Giant)' }), rules);
    expect(giant.carry.value).toBe(540);
    expect(giant.carry.lines.at(-1)!.label).toMatch(/^Powerful Build/);
    const traits = giant.features.filter((f) => f.from.startsWith('Human')).map((f) => f.name);
    expect(traits).toEqual(['Natural Athlete', 'Warrior Training', 'Giant’s Endurance', 'Powerful Build']);
    expect(deriveSheet(kaito({ raceId: 'race.human', subraceId: 'subrace.human.standard' }), rules).carry.value).toBe(270);
  });

  it('adds feats, tracking the ones with limited uses', () => {
    const limited = ofKind('feat').find((f) => typeof f.uses === 'object')!;
    const doc = kaito({ feats: ['feat.alert', limited.id] });
    const sheet = deriveSheet(doc, rules);
    expect(sheet.features.filter((f) => f.from === 'Feat').map((f) => f.name)).toEqual(['Alert', limited.name]);
    const resource = sheet.resources.find((r) => r.name === limited.name)!;
    expect(resource.max).toBeGreaterThan(0);
    const spent = spendResource(doc.state, sheet, resource.id, 1).state;
    expect(deriveSheet({ ...doc, state: spent }, rules).resources.find((r) => r.name === limited.name)!.remaining).toBe(resource.max - 1);
  });

  it('warns about a race, background, crew role or feat it cannot find, and still makes the sheet', () => {
    const sheet = deriveSheet(kaito({ raceId: 'race.nope', backgroundId: 'background.nope', crewRoleId: 'crewRole.nope', feats: ['feat.nope'] }), rules);
    expect(sheet.warnings).toHaveLength(4);
    expect(sheet.maxHp.value).toBe(75);
  });
});
