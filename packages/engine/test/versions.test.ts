// The two handbooks side by side: what is shared, what differs, and the v8.8 example character.
import { describe, expect, it } from 'vitest';
import marlo from '../../../data/examples/marlo_devilforged5_v88.json';
import { deriveSheet, newCharacter, type ClassEntry, type FeatureDef, type OptionDef } from '../src';
import { allFiles, loadRules } from './load';

const v10 = loadRules('dndf-10');
const v88 = loadRules('dndf-8.8');
const entries = allFiles.flatMap((f) => f.entries);

describe('rules versions', () => {
  it('stores an entry that is the same in both books once, tagged with both versions', () => {
    // Entries from the free 5e rules belong to both versions and have one source, not a page in each handbook.
    const shared = entries.filter((e) => e.versions.length === 2 && e.source.book !== '5e SRD 5.1');
    expect(shared.length).toBeGreaterThan(200);
    for (const entry of shared) {
      expect(entry.versions).toEqual(['dndf-8.8', 'dndf-10']);
      expect((entry.sources as Record<string, { book: string }>)['dndf-8.8']!.book).toBe('DnDF Expanded Handbook v8.8');
      expect(v88.get(entry.id)?.name).toBe(entry.name);
    }
    // No id is defined twice for the same version.
    for (const version of ['dndf-10', 'dndf-8.8'] as const) {
      const ids = entries.filter((e) => e.versions.includes(version)).map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('cites a shared entry from each version\'s own book, moving its pages along with it', () => {
    const moved = entries.find((e) => e.versions.length === 2 && e.kind === 'subclass' && (e.sources as Record<string, { page: number }>)['dndf-8.8']!.page !== e.source.page)!;
    const shift = (moved.sources as Record<string, { page: number }>)['dndf-8.8']!.page - moved.source.page;
    const old = v88.get(moved.id)!;
    const now = v10.get(moved.id)!;
    expect(old.source.book).toBe('DnDF Expanded Handbook v8.8');
    expect(now.source.book).toBe('DnDF Expanded Handbook v10');
    expect(old.features!.map((f) => f.page)).toEqual(now.features!.map((f) => f.page + shift));
    expect(old.features!.map((f) => f.text)).toEqual(now.features!.map((f) => f.text));
  });

  it('keeps separate copies where the books differ', () => {
    // Hasshoken's Internal Vibrations: half proficiency d6s in v10, the Scrapper die in v8.8.
    const text = (rules: typeof v10) => (rules.get('subclass.bruiser.hasshoken')!.features as FeatureDef[]).find((f) => f.name === 'Internal Vibrations')!.text;
    expect(text(v10)).toContain('half your proficiency bonus');
    expect(text(v88)).toContain('equal to your scrapper dice');
    expect(v88.has('class.rogue') && !v10.has('class.rogue')).toBe(true);
    expect(v10.has('class.renegade') && !v88.has('class.renegade')).toBe(true);
    expect(v10.has('race.void_century_automaton') && !v88.has('race.void_century_automaton')).toBe(true);
  });

  it('gives a v8.8 Bruiser the same worked-out numbers as v10 where the text is the same', () => {
    const scores = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
    const doc = newCharacter({ name: 'Old Kaito', rulesVersion: 'dndf-8.8', level: 7, scores, furyFeatures: ['brace_for_impact'] }, v88);
    const sheet = deriveSheet(doc, v88);
    expect(sheet.warnings).toEqual([]);
    expect(sheet.ac.value).toBe(15);
    expect(sheet.speed.value).toBe(40);
    expect(sheet.attacks[0]!.damage).toBe('1d6 + 4');
    expect(sheet.resources.find((r) => r.id === 'fury')!.max).toBe(4);
    expect(sheet.features.find((f) => f.name === 'Brace for Impact')!.rolls[0]!.dice).toBe('1d6 + 7');
    expect(sheet.features.find((f) => f.name === 'Scrapper')!.book).toBe('DnDF Expanded Handbook v8.8');
    expect(sheet.features.find((f) => f.name === 'Scrapper')!.text).not.toContain('kanabos');
  });
});

describe('Marlo, Devilforged 5 (v8.8), from the class table', () => {
  const doc = newCharacter(
    {
      name: marlo.name,
      rulesVersion: 'dndf-8.8',
      classId: 'class.devilforged',
      level: marlo.level,
      scores: marlo.abilityScores.final,
      subclass: 'subclass.devilforged.blade_smithing',
      backgroundId: 'background.salvager',
      crewRoleId: 'crewRole.shipwright',
      skills: ['deception', 'intimidation'],
    },
    v88,
  );
  const sheet = deriveSheet(doc, v88);
  const column = (key: string) => sheet.classTable.find((c) => c.key === key)?.value;

  it('Slots: L5 → 2 slots of 3rd, back on a short rest', () => {
    expect(column('powerSlots')).toBe(2);
    expect(column('slotLevel')).toBe('3rd');
    expect(sheet.resources.find((r) => r.id === 'powerSlots')).toMatchObject({ max: 2, recharge: 'short' });
    expect(marlo.spellcasting.slots).toMatchObject({ count: 2, level: 3, recharge: 'short' });
  });

  it('Known: cantrips 3, powers 6, emanations 4 at L5', () => {
    expect([column('cantripsKnown'), column('powersKnown'), column('emanationsKnown')]).toEqual([3, 6, 4]);
  });

  it('matches the example sheet: HP 38, proficiency +3, Willpower 5, Haki DC 13, passive Perception 13', () => {
    expect(sheet.warnings).toEqual([]);
    expect(sheet.maxHp.value).toBe(marlo.derived.hp.max);
    expect(sheet.prof.value).toBe(marlo.derived.proficiencyBonus);
    expect(sheet.willpower.value).toBe(marlo.derived.willpower);
    expect(sheet.hakiSaveDc.value).toBe(marlo.derived.hakiSaveDC);
    expect(sheet.passivePerception.value).toBe(marlo.derived.passivePerception);
    expect(sheet.saves.cha.value).toBe(7);
    // Salvager gives Investigation and Perception, Shipwright gives Athletics.
    expect(sheet.skills.filter((s) => s.proficient).map((s) => s.id)).toEqual(['athletics', 'deception', 'intimidation', 'investigation', 'perception']);
  });

  it('has Blade Smithing\'s features and can pick emanations from the 87 in the book', () => {
    const names = sheet.features.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['Devil’s Branding', 'Hell’s Duelist', 'Infuse Devil Fruit', 'Sea Devil’s Emanations']));
    const cls = v88.get('class.devilforged') as ClassEntry;
    const choice = cls.features.find((f) => f.choices)!.choices!;
    const options = v88.get(choice.from)!.options as OptionDef[];
    expect(options).toHaveLength(87);
    const picked = marlo.emanations.map((e) => options.find((o) => o.name === e.name)!.id);
    expect(picked).toHaveLength(4);
    const withPicks = deriveSheet({ ...doc, choices: { [choice.id]: picked } }, v88);
    expect(withPicks.warnings).toEqual([]);
    expect(withPicks.features.map((f) => f.name)).toEqual(expect.arrayContaining(marlo.emanations.map((e) => e.name)));
    expect(withPicks.features.find((f) => f.name === 'Zoan Mount')!.page).toBe(129);
  });
});
