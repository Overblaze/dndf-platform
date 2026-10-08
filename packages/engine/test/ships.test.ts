// The DM Guide's ship chapter as data: the ships, the upgrades and the chapter's rules (PDF pages 11–43).
import { describe, expect, it } from 'vitest';
import type { RuleEntry, RulesVersion } from '../src';
import { loadRules } from './load';

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('ships and upgrades (%s)', (version) => {
  const rules = loadRules(version);
  const all = [...rules.values()];
  const ships = all.filter((e) => e.kind === 'shipType');
  const upgrades = all.filter((e) => e.kind === 'shipUpgrade');
  const ship = (name: string) => ships.find((s) => s.name === name)!;

  it('has the eleven ships of the chapter, each with its numbers and components', () => {
    expect(ships.map((s) => s.name)).toEqual(['Waver', 'Rowboat', 'Sloop', 'Caravel', 'Submarine', 'Cog', 'Brig', 'Carrack', 'Galleon', 'Man-O-War', 'Battleship']);
    for (const s of ships) {
      expect(s.source, s.name).toMatchObject({ book: 'DnDF DM Guide' });
      for (const key of ['cost', 'upgradeSlots', 'crew', 'passengers', 'cargoTons']) expect(typeof s[key], `${s.name} ${key}`).toBe('number');
      expect(Object.keys(s.abilities as object), s.name).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
      const components = s.components as { name: string; role: string; ac?: number; hp?: number; text: string }[];
      expect(components[0], s.name).toMatchObject({ name: 'Hull', role: 'hull' });
      expect(components.every((c) => c.role === 'other' || (typeof c.ac === 'number' && typeof c.hp === 'number')), s.name).toBe(true);
      expect(String(s.actions).length, s.name).toBeGreaterThan(40);
    }
  });

  it('the Caravel is as the book prints it (the sample in docs/FORMULAS.md)', () => {
    expect(ship('Caravel')).toMatchObject({
      size: 'Gargantuan', dimensions: '70 ft. by 20 ft.', cost: 50_000_000, upgradeSlots: 5, crew: 8, passengers: 10, cargoTons: 10, pace: { mph: 4, milesPerDay: 96 },
      abilities: { str: 18, dex: 7, con: 15, int: 0, wis: 0, cha: 0 }, damageImmunities: 'poison, psychic', source: { page: 15 },
    });
    expect(ship('Caravel').components).toEqual([
      expect.objectContaining({ name: 'Hull', role: 'hull', ac: 15, hp: 150, threshold: 10, count: 1 }),
      expect.objectContaining({ name: 'Control: Helm', role: 'control', ac: 15, hp: 50 }),
      expect.objectContaining({ name: 'Movement: Sails', role: 'movement', ac: 12, hp: 100, speed: 35, speedLoss: { feet: 5, per: 25 } }),
      expect.objectContaining({ name: 'Weapon: Cannon (2)', role: 'weapon', ac: 15, hp: 50, count: 2 }),
    ]);
    expect(ship('Battleship')).toMatchObject({ special: true, cost: 3_000_000_000, crew: 1000, cargoTons: 10000 });
    expect(ship('Waver')).toMatchObject({ size: 'Medium', special: true, upgradeSlots: 0, pace: { mph: 25 } });
  });

  it('has the 25 upgrades in their four groups, each with slots, a DC and a cost', () => {
    expect(upgrades).toHaveLength(25);
    expect([...new Set(upgrades.map((u) => u.group))]).toEqual(['Movement Components', 'Control Components', 'Hull Components', 'Weapon Components']);
    for (const u of upgrades) {
      expect(typeof u.slots, u.name).toBe('number');
      expect(typeof u.upgradeDc, u.name).toBe('number');
      expect(typeof u.cost === 'number' || typeof u.costPercent === 'number', u.name).toBe(true);
    }
    const of = (name: string) => upgrades.find((u) => u.name === name) as RuleEntry;
    expect(of('Paddle-Wheel Upgrade')).toMatchObject({ slots: 2, upgradeDc: 17, cost: 10_000_000, costPercent: 20, ac: 12, hp: 100, requirement: 'At least one huge engine installed on the ship and a control component' });
    expect(of('Helm Upgrade')).toMatchObject({ slots: 1, costPercent: 5 });
    expect(of('Helm Upgrade').cost).toBeUndefined(); // "5% of ship cost": a share only, not ฿5
    expect(of('Cannon Upgrade')).toMatchObject({ group: 'Weapon Components', cost: 20_000_000, slots: 1 });
  });

  it('has the chapter’s rules, with its tables whole', () => {
    const names = all.filter((e) => e.id.startsWith('rule.ships_')).map((e) => e.name);
    expect(names).toEqual(['Ship Stat Blocks', 'Ship Upgrades', 'Crew', 'Sailing', 'Naval Combat', 'Enhanced Naval Combat Rules', 'Crashing', 'Docking a Ship', 'Ship Salvaging', 'Mapping']);
    const section = (rule: string, name: string) => ((rules.get(rule)!.sections ?? []) as { name: string; text: string; tables?: { rows: string[][] }[] }[]).find((s) => s.name === name)!;
    const events = section('rule.ships_sailing', '100 Possible Example Events').tables![0]!.rows;
    expect(events[0]).toEqual(['d100', 'Event']);
    expect(events.slice(1).map((r) => r[0])).toEqual(Array.from({ length: 100 }, (_, i) => String(i + 1)));
    expect(section('rule.ships_crew', 'Ship Tragedy Table').tables![0]!.rows.map((r) => r[0])).toEqual(['d20', '1-5', '6-7', '8-9', '10-11', '12-13', '14-15', '16-17', '18-19', '20']);
    expect(section('rule.ships_crashing', 'Crash Damage').tables![0]!.rows.at(-1)).toEqual(['Gargantuan', '16d10']);
    expect(section('rule.ships_sailing', 'Hellish Weather Event').tables![0]!.rows.at(-1)).toEqual(['6', 'Any', '-', 'Tsunami']);
    expect(section('rule.ships_ship_stat_blocks', 'Sentience').text).toMatch(/^A ship will become sentient/);
  });
});
