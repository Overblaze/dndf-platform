import { describe, expect, it } from 'vitest';
import { fillTemplate, formatDice, parseDice, rollD20, rollDice } from '../src';

/** A fixed sequence of die faces, turned into the random numbers that produce them. */
const faces = (sides: number, ...values: number[]) => {
  let i = 0;
  return () => (values[i++ % values.length]! - 0.5) / sides;
};

describe('dice', () => {
  it('reads and prints dice text', () => {
    expect(parseDice('2d6 + 1d4 + 3')).toEqual({ terms: [{ count: 2, sides: 6, sign: 1 }, { count: 1, sides: 4, sign: 1 }], bonus: 3 });
    expect(formatDice(parseDice('1d6+4+3'))).toBe('1d6 + 7');
    expect(formatDice(parseDice('d8 - 1'))).toBe('1d8 - 1');
    expect(formatDice(parseDice('1 + 4'))).toBe('5');
    expect(() => parseDice('lots')).toThrow(/Can't read dice/);
    expect(() => parseDice('2d6 + ')).toThrow(/Can't read dice/);
  });

  it('fills rules templates', () => {
    const scope = { level: 7, prof: 3, col: { scrapperDie: 'd6' } };
    expect(fillTemplate('1{col.scrapperDie} + {level}', scope)).toBe('1d6 + 7');
    expect(fillTemplate('{ceil(prof/2)}d6', scope)).toBe('2d6');
    expect(fillTemplate('{level>=17 ? 4 : level>=11 ? 3 : 2}{col.scrapperDie}', scope)).toBe('2d6');
  });

  it('rolls every die and adds the bonus', () => {
    const result = rollDice('2d6 + 4', faces(6, 3, 5));
    expect(result).toMatchObject({ total: 12, bonus: 4, rolls: [{ sides: 6, value: 3 }, { sides: 6, value: 5 }] });
  });

  it('stays within 1..sides at the edges of the random range', () => {
    expect(rollDice('1d20', () => 0).total).toBe(1);
    expect(rollDice('1d20', () => 0.999999).total).toBe(20);
  });

  it('rolls d20s with advantage and disadvantage', () => {
    expect(rollD20(7, faces(20, 4, 17), 'advantage')).toMatchObject({ die: 17, total: 24, dice: [4, 17] });
    expect(rollD20(7, faces(20, 4, 17), 'disadvantage')).toMatchObject({ die: 4, total: 11 });
    expect(rollD20(0, faces(20, 20))).toMatchObject({ natural20: true, natural1: false });
    expect(rollD20(0, faces(20, 1)).natural1).toBe(true);
  });
});
