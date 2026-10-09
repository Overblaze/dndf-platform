import { describe, expect, it } from 'vitest';
import { readQuantity } from './QuantityInput';

describe('a typed count', () => {
  it('a plain number is the new total; a sign in front makes it a change', () => {
    expect(readQuantity('500', 2000)).toBe(500);
    expect(readQuantity('-1500', 2000)).toBe(500); // spend 1,500 of 2,000 rations
    expect(readQuantity('+200', 500)).toBe(700);
    expect(readQuantity('0', 12)).toBe(0);
    expect(readQuantity(' 1,250 ', 3)).toBe(1250);
    expect(readQuantity('- 1 500', 2000)).toBe(500);
    expect(readQuantity('−1500', 2000)).toBe(500); // the minus sign a phone keyboard may give
  });

  it('never goes below nothing, or past a limit', () => {
    expect(readQuantity('-99', 5)).toBe(0);
    expect(readQuantity('+9', 2, 0, 3)).toBe(3);
    expect(readQuantity('7', 2, 0, 3)).toBe(3);
    expect(readQuantity('-1', 3, 1)).toBe(2);
    expect(readQuantity('-5', 3, 1)).toBe(1);
  });

  it('anything else changes nothing', () => {
    for (const typed of ['', '  ', 'abc', '12abc', '1.5', '--5', '+-3', '5-2', '1e3', 'NaN']) expect(readQuantity(typed, 42), typed).toBeNull();
  });
});
