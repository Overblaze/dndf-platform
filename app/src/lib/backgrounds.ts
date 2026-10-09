/** Built-in sheet backgrounds, in the theme's own colors (docs/THEME.md). `grid` is the chart-line color. */
export interface BackgroundPreset {
  id: string;
  label: string;
  color: string;
  grid: string;
}

export const DEFAULT_BACKGROUND = 'chart';

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'chart', label: 'Sea chart', color: '#EFE0B9', grid: 'rgba(150, 120, 70, 0.16)' },
  { id: 'poster', label: 'Poster paper', color: '#FBF3DD', grid: 'rgba(138, 111, 69, 0.12)' },
  { id: 'sea', label: 'Open sea', color: '#2E7D74', grid: 'rgba(217, 238, 230, 0.2)' },
  { id: 'deep', label: 'Deep water', color: '#1F5E57', grid: 'rgba(217, 238, 230, 0.14)' },
  { id: 'land', label: 'Terracotta', color: '#A9471F', grid: 'rgba(244, 214, 188, 0.2)' },
  { id: 'fruit', label: 'Devil Fruit', color: '#6A4C9C', grid: 'rgba(232, 221, 242, 0.2)' },
  { id: 'night', label: 'Night watch', color: '#3B2A1A', grid: 'rgba(184, 155, 99, 0.22)' },
];

/** What stands for the table's own picture among the swatches. */
export const TABLE_BACKGROUND = 'table';

/**
 * Whether the table's picture is what shows behind a character's sheet: there is one, and the
 * character has chosen no background of its own (a built-in one chosen on purpose, or a picture).
 */
export function showsTablePicture(background: { kind: string } | undefined, tableUrl: string | null): boolean {
  return Boolean(tableUrl) && background === undefined;
}

/**
 * What choosing a built-in background saves. With no table picture the plain sea chart is simply "nothing chosen";
 * with one, nothing chosen means the table's picture, so the sea chart has to be chosen by name.
 */
export function presetChoice(presetId: string, tableUrl: string | null): { kind: 'preset'; id: string } | undefined {
  if (presetId === TABLE_BACKGROUND) return undefined;
  return presetId === DEFAULT_BACKGROUND && !tableUrl ? undefined : { kind: 'preset', id: presetId };
}

/** Which swatch is lit: the built-in one chosen, the table's picture, or none while a picture of the player's own is up. */
export function selectedSwatch(background: { kind: string; id?: string } | undefined, tableUrl: string | null): string | null {
  if (background?.kind === 'preset') return background.id ?? DEFAULT_BACKGROUND;
  if (background) return null;
  return tableUrl ? TABLE_BACKGROUND : DEFAULT_BACKGROUND;
}

export const DEFAULT_CARD_OPACITY = 88;
export const MIN_CARD_OPACITY = 50;

/** Box colors that go with the built-in backgrounds. Any other color can be picked too. */
export const CARD_COLORS: { label: string; color: string | null }[] = [
  { label: 'Parchment', color: null },
  { label: 'Poster', color: '#FBF3DD' },
  { label: 'Sea foam', color: '#D9EEE6' },
  { label: 'Deep water', color: '#1F5E57' },
  { label: 'Sand', color: '#F4D6BC' },
  { label: 'Terracotta', color: '#8E3B1C' },
  { label: 'Lilac', color: '#E8DDF2' },
  { label: 'Devil Fruit', color: '#5A3E8A' },
  { label: 'Ink', color: '#3B2A1A' },
];

export const DEFAULT_CARD_COLOR = '#F8EED4';
