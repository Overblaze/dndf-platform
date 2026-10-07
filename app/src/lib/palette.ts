// Works out a readable set of sheet colors from the box color a player picks:
// text in a deep or pale shade of the same hue, plus matching borders, tiles and fields.

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (same) to 21 (black on white). */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const ACCENT: Rgb = [169, 71, 31];
const ACCENT_INK: Rgb = [142, 59, 28];

export interface SheetPalette {
  card: string;
  cardInner: string;
  raised: string;
  field: string;
  line: string;
  rule: string;
  ink: string;
  inkSoft: string;
  muted: string;
  heading: string;
  mark: string;
}

/**
 * Text is the box color pushed toward black or white (whichever reads better) only as far as
 * needed, so it keeps the box's hue. Contrast is measured against the darkest surface text sits
 * on (buttons), so it holds on tiles and fields too: at least 4.5:1 for small labels whenever
 * the color allows, more for body text.
 */
export function sheetPalette(cardHex: string): SheetPalette | null {
  const card = parseHex(cardHex);
  if (!card) return null;
  const pole = contrast(card, WHITE) > contrast(card, BLACK) ? WHITE : BLACK;
  const away = pole === WHITE ? BLACK : WHITE;
  // Tiles and buttons step toward the text color on very light or very dark boxes (as the theme's
  // parchment does). On mid-tones that would eat the contrast, so there they step the other way.
  const step = contrast(card, pole) >= 9 ? pole : away;
  const cardInner = mix(card, step, 0.06);
  const raised = mix(card, step, 0.12);
  const surfaces = [card, cardInner, raised];
  const worst = (color: Rgb) => Math.min(...surfaces.map((s) => contrast(color, s)));

  const reach = (target: number): Rgb => {
    for (let t = 0.3; t < 1; t += 0.02) {
      const shade = mix(card, pole, t);
      if (worst(shade) >= target) return shade;
    }
    return pole;
  };
  const ink = reach(10);
  return {
    card: toHex(card),
    cardInner: toHex(cardInner),
    raised: toHex(raised),
    field: toHex(mix(card, away, 0.3)),
    line: toHex(mix(card, pole, 0.4)),
    rule: toHex(mix(card, pole, 0.22)),
    ink: toHex(ink),
    inkSoft: toHex(reach(7.5)),
    muted: toHex(reach(5)),
    // The theme's terracotta where it still reads; otherwise the text color.
    heading: toHex(worst(ACCENT_INK) >= 4.5 ? ACCENT_INK : ink),
    mark: toHex(contrast(ACCENT, card) >= 3 ? ACCENT : ink),
  };
}

/** The palette as CSS custom properties for the sheet's wrapper. */
export function paletteVars(palette: SheetPalette): Record<string, string> {
  return {
    '--card': palette.card,
    '--card-inner': palette.cardInner,
    '--raised': palette.raised,
    '--field': palette.field,
    '--line': palette.line,
    '--rule': palette.rule,
    '--ink': palette.ink,
    '--ink-soft': palette.inkSoft,
    '--muted': palette.muted,
    '--heading': palette.heading,
    '--mark': palette.mark,
  };
}
