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
