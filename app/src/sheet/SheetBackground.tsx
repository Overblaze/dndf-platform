import type { SheetAppearance } from '@dndf/engine';
import { useEffect, useState } from 'react';
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, DEFAULT_CARD_OPACITY, MIN_CARD_OPACITY } from '../lib/backgrounds';
import type { CharacterStore } from '../lib/store';

export function cardOpacity(appearance: SheetAppearance | undefined): number {
  const value = appearance?.cardOpacity ?? DEFAULT_CARD_OPACITY;
  return Math.min(100, Math.max(MIN_CARD_OPACITY, value));
}

/** Paints the character's chosen background behind the sheet and makes the cards let it show through. */
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

  const opacity = cardOpacity(appearance);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--card-bg', `color-mix(in srgb, var(--card) ${opacity}%, transparent)`);
    return () => {
      root.style.removeProperty('--card-bg');
    };
  }, [opacity]);

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
