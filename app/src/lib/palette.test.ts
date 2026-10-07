import { describe, expect, it } from 'vitest';
import { contrast, parseHex, sheetPalette, toHex, type Rgb } from './palette';

const rgb = (hex: string) => parseHex(hex)!;

describe('sheet palette', () => {
  it('measures contrast the WCAG way', () => {
    expect(contrast(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrast(rgb('#777777'), rgb('#777777'))).toBe(1);
    expect(parseHex('nope')).toBeNull();
    expect(sheetPalette('nope')).toBeNull();
  });

  it('puts dark text on light boxes and light text on dark boxes, in the box\'s own hue', () => {
    const light = sheetPalette('#D9EEE6')!; // pale sea green
    const [red, green] = rgb(light.ink);
    expect(green).toBeGreaterThan(red);
    expect(contrast(rgb(light.ink), rgb('#000000'))).toBeLessThan(3);
    expect(light.ink).not.toBe('#000000');

    const dark = sheetPalette('#1F5E57')!; // deep water
    expect(contrast(rgb(dark.ink), rgb('#ffffff'))).toBeLessThan(2);
  });

  it('keeps every text color readable on every surface, for any box color', () => {
    // A sweep over the whole color cube, plus the theme's own colors.
    const colors: string[] = ['#F8EED4', '#A9471F', '#6A4C9C', '#2E7D74', '#3B2A1A', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) colors.push(toHex([r, g, b] as Rgb));

    for (const color of colors) {
      const p = sheetPalette(color)!;
      const surfaces = [p.card, p.cardInner, p.raised, p.field].map(rgb);
      const lowest = (text: string) => Math.min(...surfaces.map((s) => contrast(rgb(text), s)));
      // Black or white on a mid-tone box tops out a little above 4.5:1, so that is the floor.
      expect(lowest(p.ink), `ink on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(lowest(p.inkSoft), `soft text on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(lowest(p.muted), `labels on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(lowest(p.heading), `headings on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(p.mark), rgb(p.card)), `pips on ${color}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves the theme\'s terracotta headings alone where they already read well', () => {
    expect(sheetPalette('#F8EED4')!.heading).toBe('#8e3b1c');
    expect(sheetPalette('#A9471F')!.heading).not.toBe('#8e3b1c');
  });
});
