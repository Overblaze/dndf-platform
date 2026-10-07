// A character can hold more than one crew role: each role's skills and features all count.
import { describe, expect, it } from 'vitest';
import { crewRolesOf, deriveSheet, newCharacter, normalizeDoc, type CharacterDoc, type RulesVersion } from '../src';
import { loadRules } from './load';

const scores = { str: 14, dex: 12, con: 14, int: 10, wis: 12, cha: 10 };
const proficient = (doc: CharacterDoc, version: RulesVersion) => deriveSheet(doc, loadRules(version)).skills.filter((s) => s.proficient).map((s) => s.id).sort();

describe.each(['dndf-10', 'dndf-8.8'] as RulesVersion[])('more than one crew role (%s)', (version) => {
  const rules = loadRules(version);
  const make = (crewRoleIds: string[]) => newCharacter({ name: 'Test', rulesVersion: version, classId: 'class.warrior', level: 5, scores, crewRoleIds }, rules);

  it('shipwright and helmsman together: Athletics from one, Perception and Survival from the other, and both roles’ features', () => {
    const doc = make(['crewRole.shipwright', 'crewRole.helmsman']);
    const sheet = deriveSheet(doc, rules);
    expect(sheet.warnings).toEqual([]);
    expect(proficient(doc, version)).toEqual(['athletics', 'perception', 'survival']);
    expect(sheet.skills.find((s) => s.id === 'athletics')!.value).toBe(2 + 3); // Str 2 + prof 3
    expect(sheet.skills.find((s) => s.id === 'perception')!.value).toBe(1 + 3); // Wis 1 + prof 3
    const names = sheet.features.map((f) => f.name);
    for (const name of ['Ship Building, Upgrading, and Repairing', 'Defensive Coating', 'Through Thick and Thin', 'At the Helm']) expect(names, name).toContain(name);
  });

  it('one role alone gives only its own skills', () => {
    expect(proficient(make(['crewRole.shipwright']), version)).toEqual(['athletics']);
    expect(proficient(make([]), version)).toEqual([]);
  });

  it('a character saved with the old single crew role still has it, and the same role is never counted twice', () => {
    const old = { ...make([]), crewRoles: undefined, crewRole: { id: 'crewRole.shipwright' } } as CharacterDoc;
    expect(proficient(old, version)).toEqual(['athletics']);
    expect(normalizeDoc(JSON.parse(JSON.stringify(old)))!.crewRoles).toEqual([{ id: 'crewRole.shipwright' }]);
    expect(crewRolesOf({ crewRole: { id: 'crewRole.shipwright' }, crewRoles: [{ id: 'crewRole.shipwright' }, { id: 'crewRole.helmsman' }] })).toEqual([{ id: 'crewRole.shipwright' }, { id: 'crewRole.helmsman' }]);
  });

  it('a role that is not in the handbook warns and never blocks', () => {
    const sheet = deriveSheet(make(['crewRole.shipwright', 'crewRole.nope']), rules);
    expect(sheet.warnings).toEqual(['Crew role "crewRole.nope" is not in the rules data.']);
  });
});
