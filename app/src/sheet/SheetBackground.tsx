import type { SheetAppearance } from '@dndf/engine';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppBackground } from '../lib/appBackground';
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, DEFAULT_CARD_COLOR, DEFAULT_CARD_OPACITY, MIN_CARD_OPACITY, showsTablePicture } from '../lib/backgrounds';
import { paletteVars, sheetPalette } from '../lib/palette';
import type { CharacterStore } from '../lib/store';

export function cardOpacity(appearance: SheetAppearance | undefined): number {
  const value = appearance?.cardOpacity ?? DEFAULT_CARD_OPACITY;
  return Math.min(100, Math.max(MIN_CARD_OPACITY, value));
}

/**
 * The sheet's own colors as CSS variables: see-through boxes, and when the player picked a box
 * color, the text, borders and tiles worked out to go with it.
 */
export function sheetThemeVars(appearance: SheetAppearance | undefined): CSSProperties {
  const palette = appearance?.cardColor ? sheetPalette(appearance.cardColor) : null;
  return {
    ...(palette ? paletteVars(palette) : {}),
    '--card-bg': `color-mix(in srgb, ${palette?.card ?? DEFAULT_CARD_COLOR} ${cardOpacity(appearance)}%, transparent)`,
  } as CSSProperties;
}

/** Paints the character's chosen background behind the sheet. */
export function SheetBackground({ appearance, store }: { appearance: SheetAppearance | undefined; store: CharacterStore }) {
  const background = appearance?.background;
  const ref = background?.kind === 'image' ? background.ref : null;
  const [picture, setPicture] = useState<string | null>(null);

  useEffect(() => {
    setPicture(null);
    if (!ref) return;
    let current = true;
    store.backgroundUrl(ref).then((url) => current && setPicture(url), () => undefined);
    return () => {
      current = false;
    };
  }, [ref, store]);

  // Nothing chosen for this character: the table's picture, painted by the app itself, is left to show.
  const { url: tablePicture } = useAppBackground();
  if (showsTablePicture(background, tablePicture)) return null;
  const presetId = background?.kind === 'preset' ? background.id : DEFAULT_BACKGROUND;
  const preset = BACKGROUND_PRESETS.find((p) => p.id === presetId) ?? BACKGROUND_PRESETS[0]!;
  const style = picture
    ? { backgroundColor: 'var(--ink)', backgroundImage: `url("${picture}")` }
    : {
        backgroundColor: preset.color,
        backgroundImage: `linear-gradient(${preset.grid} 1px, transparent 1px), linear-gradient(90deg, ${preset.grid} 1px, transparent 1px)`,
      };
  return <div className={picture ? 'sheet-bg sheet-bg-picture' : 'sheet-bg'} style={style} aria-hidden="true" />;
}
