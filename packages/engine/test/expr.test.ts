import { describe, expect, it } from 'vitest';
import { evaluate, explain } from '../src';

const scope = { level: 11, prof: 4, mod: { con: 3, dex: -1 }, col: { fury: 6, scrapperDie: 'd8' } };

describe('rules expressions', () => {
  it('does arithmetic with the usual precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('10 - 2 - 3')).toBe(5);
    expect(evaluate('-mod.dex + 1', scope)).toBe(2);
  });

  it('reads values, columns and functions', () => {
    expect(evaluate('prof*2', scope)).toBe(8);
    expect(evaluate('col.fury', scope)).toBe(6);
    expect(evaluate("ceil(prof/2) + col.scrapperDie", scope)).toBe('2d8');
    expect(evaluate('max(1, floor(level / 4))', scope)).toBe(2);
  });

  it('handles the King Punch charge cap by level', () => {
    const cap = 'level>=17 ? 60 : level>=11 ? 40 : 30';
    expect([3, 11, 17].map((level) => evaluate(cap, { level }))).toEqual([30, 40, 60]);
  });

  it('handles conditions', () => {
    expect(evaluate('noArmor && noShield', { noArmor: true, noShield: false })).toBe(false);
    expect(evaluate('!noArmor || level >= 5', { noArmor: true, level: 5 })).toBe(true);
  });

  it('explains subtraction with signed lines', () => {
    expect(explain('10 + mod.dex - 2', scope)).toEqual({
      value: 7,
      lines: [
        { label: 'Base', value: 10 },
        { label: 'Dexterity modifier', value: -1 },
        { label: 'Base', value: -2 },
      ],
    });
  });

  it('rejects unknown names and broken syntax instead of guessing', () => {
    expect(() => evaluate('prof + nope', scope)).toThrow(/Unknown value "nope"/);
    expect(() => evaluate('prof +', scope)).toThrow(/Bad expression/);
    expect(() => evaluate('alert(1)', scope)).toThrow(/Unknown function/);
    expect(() => evaluate('prof ; 1', scope)).toThrow(/Bad expression/);
  });
});
