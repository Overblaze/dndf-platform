import type { SheetAppearance } from '@dndf/engine';
import { useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useAppBackground } from '../lib/appBackground';
import { BACKGROUND_PRESETS, CARD_COLORS, DEFAULT_CARD_COLOR, MIN_CARD_OPACITY, TABLE_BACKGROUND, presetChoice, selectedSwatch } from '../lib/backgrounds';
import { sheetPalette } from '../lib/palette';
import { prepareImage } from '../lib/image';
import type { CharacterStore } from '../lib/store';
import type { LiveCharacter } from '../lib/useCharacter';
import { cardOpacity } from './SheetBackground';

/** Pick a background (built-in or your own picture), a box color, and how see-through the boxes are. Changes show at once. */
export function AppearanceDialog({ live, store, id, onClose }: { live: LiveCharacter; store: CharacterStore; id: string; onClose: () => void }) {
  const { doc } = live;
  const appearance = doc.appearance ?? {};
  const background = appearance.background;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const set = (next: SheetAppearance, log?: string) => live.setDoc({ ...doc, appearance: next }, log);
  const { url: tablePicture } = useAppBackground();
  const dropPicture = () => {
    if (background?.kind === 'image') void store.removeBackground(background.ref).catch(() => undefined);
  };

  const choosePreset = (presetId: string) => {
    dropPicture();
    set({ ...appearance, background: presetChoice(presetId, tablePicture) }, 'Sheet background changed');
  };

  const upload = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const ref = await store.uploadBackground(id, await prepareImage(chosen));
      // A new upload gets a new reference; the old picture is no longer needed.
      if (background?.kind === 'image' && background.ref !== ref) dropPicture();
      set({ ...appearance, background: { kind: 'image', ref } }, 'Sheet background picture uploaded');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const selected = selectedSwatch(background, tablePicture);

  return (
    <Dialog title="Sheet appearance" onClose={onClose}>
      <fieldset>
        <legend className="label">Built-in backgrounds</legend>
        <div className="swatches">
          {tablePicture && (
            <button className={selected === TABLE_BACKGROUND ? 'swatch swatch-on' : 'swatch'} aria-pressed={selected === TABLE_BACKGROUND} onClick={() => choosePreset(TABLE_BACKGROUND)}>
              <span className="swatch-color" style={{ backgroundImage: `url("${tablePicture}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <span>The table’s picture</span>
            </button>
          )}
          {BACKGROUND_PRESETS.map((preset) => (
            <button key={preset.id} className={selected === preset.id ? 'swatch swatch-on' : 'swatch'} aria-pressed={selected === preset.id} onClick={() => choosePreset(preset.id)}>
              <span
                className="swatch-color"
                style={{
                  backgroundColor: preset.color,
                  backgroundImage: `linear-gradient(${preset.grid} 1px, transparent 1px), linear-gradient(90deg, ${preset.grid} 1px, transparent 1px)`,
                }}
              />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Your own picture</legend>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        <div className="row wrap">
          <button className="btn btn-primary" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? 'Uploading…' : background?.kind === 'image' ? 'Replace picture' : 'Upload a picture'}
          </button>
          {background?.kind === 'image' && (
            <button className="btn" disabled={busy} onClick={() => choosePreset(TABLE_BACKGROUND)}>
              Remove picture
            </button>
          )}
        </div>
        <p className="page-ref">
          {store.local
            ? 'Not signed in: the picture is kept only in this browser.'
            : 'Only you and your DM can see it. Pictures are shrunk to 1920 px before uploading.'}
        </p>
        {error && <p className="notice" role="alert">{error}</p>}
      </fieldset>

      <fieldset>
        <legend className="label">Box color</legend>
        <div className="swatches">
          {CARD_COLORS.map((choice) => {
            const on = (appearance.cardColor ?? null)?.toLowerCase() === (choice.color?.toLowerCase() ?? null);
            const palette = sheetPalette(choice.color ?? DEFAULT_CARD_COLOR);
            return (
              <button key={choice.label} className={on ? 'swatch swatch-on' : 'swatch'} aria-pressed={on} onClick={() => set({ ...appearance, cardColor: choice.color ?? undefined }, 'Sheet box color changed')}>
                <span className="swatch-color swatch-text" style={{ backgroundColor: palette?.card, color: palette?.ink, borderColor: palette?.line }}>Aa</span>
                <span>{choice.label}</span>
              </button>
            );
          })}
        </div>
        <label className="field-inline color-pick">
          <input type="color" value={appearance.cardColor ?? DEFAULT_CARD_COLOR} onChange={(e) => set({ ...appearance, cardColor: e.target.value })} aria-label="Pick any box color" />
          <span>Pick any color. The text color is chosen to match it and stay readable.</span>
        </label>
      </fieldset>

      <label className="field">
        <span className="label">How solid the boxes are: {cardOpacity(doc.appearance)}%</span>
        <input
          type="range"
          min={MIN_CARD_OPACITY}
          max={100}
          step={1}
          value={cardOpacity(doc.appearance)}
          onChange={(e) => set({ ...appearance, cardOpacity: Number(e.target.value) })}
        />
      </label>
      {cardOpacity(doc.appearance) < 70 && <p className="notice">Text can get hard to read over a busy picture this far down. It's your call.</p>}
    </Dialog>
  );
}
