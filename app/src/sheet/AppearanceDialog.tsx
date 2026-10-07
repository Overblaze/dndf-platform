import type { SheetAppearance } from '@dndf/engine';
import { useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, MIN_CARD_OPACITY } from '../lib/backgrounds';
import { prepareImage } from '../lib/image';
import type { CharacterStore } from '../lib/store';
import type { LiveCharacter } from '../lib/useCharacter';
import { cardOpacity } from './SheetBackground';

/** Pick a built-in background or upload a picture, and set how see-through the cards are. Changes show at once. */
export function AppearanceDialog({ live, store, id, onClose }: { live: LiveCharacter; store: CharacterStore; id: string; onClose: () => void }) {
  const { doc } = live;
  const appearance = doc.appearance ?? {};
  const background = appearance.background;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const set = (next: SheetAppearance, log?: string) => live.setDoc({ ...doc, appearance: next }, log);
  const dropPicture = () => {
    if (background?.kind === 'image') void store.removeBackground(background.ref).catch(() => undefined);
  };

  const choosePreset = (presetId: string) => {
    dropPicture();
    set({ ...appearance, background: presetId === DEFAULT_BACKGROUND ? undefined : { kind: 'preset', id: presetId } }, 'Sheet background changed');
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

  const selected = background?.kind === 'preset' ? background.id : background ? null : DEFAULT_BACKGROUND;

  return (
    <Dialog title="Sheet background" onClose={onClose}>
      <fieldset>
        <legend className="label">Built-in backgrounds</legend>
        <div className="swatches">
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
            <button className="btn" disabled={busy} onClick={() => choosePreset(DEFAULT_BACKGROUND)}>
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
