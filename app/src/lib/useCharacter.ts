import { deriveSheet, type CharacterDoc, type CharacterState, type Sheet } from '@dndf/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rules } from './rules';
import type { CharacterStore } from './store';

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface LiveCharacter {
  doc: CharacterDoc;
  sheet: Sheet;
  status: SaveStatus;
  saveError: string | null;
  /** Replace the document. `log` becomes a line in the character's history. */
  setDoc: (next: CharacterDoc, log?: string) => void;
  /** Replace only the play state (HP, uses, toggles…). */
  setState: (next: CharacterState, log?: string) => void;
}

const SAVE_DELAY_MS = 600;

/** Loads one character and keeps it saved: changes show at once and are written shortly after. */
export function useCharacter(store: CharacterStore, id: string) {
  const [doc, setDocState] = useState<CharacterDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const pending = useRef<CharacterDoc | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    store.save(id, next).then(
      () => {
        if (!pending.current) setStatus('saved');
        setSaveError(null);
      },
      (error: Error) => {
        // Keep the newest unsaved version so the next change retries it.
        pending.current ??= next;
        setStatus('error');
        setSaveError(error.message);
      },
    );
  }, [store, id]);

  useEffect(() => {
    let current = true;
    setDocState(null);
    setMissing(false);
    setLoadError(null);
    store.get(id).then(
      (stored) => {
        if (!current) return;
        if (stored) setDocState(stored.doc);
        else setMissing(true);
      },
      (error: Error) => current && setLoadError(error.message),
    );
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [store, id, flush]);

  const setDoc = useCallback(
    (next: CharacterDoc, log?: string) => {
      setDocState(next);
      pending.current = next;
      setStatus('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
      if (log) void store.log(id, log);
    },
    [store, id, flush],
  );

  const sheet = useMemo(() => (doc ? deriveSheet(doc, rules) : null), [doc]);

  const live: LiveCharacter | null =
    doc && sheet
      ? { doc, sheet, status, saveError, setDoc, setState: (state, log) => setDoc({ ...doc, state }, log) }
      : null;
  return { live, loadError, missing };
}
