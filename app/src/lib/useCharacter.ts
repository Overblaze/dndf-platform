import { deriveSheet, type CharacterDoc, type CharacterState, type Sheet } from '@dndf/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldSnapshot } from './history';
import { ruleSet } from './rules';
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
  /** When a copy of the character was last kept for History. */
  const lastSnapshotAt = useRef(0);
  /** The character as last shown, whether or not React has re-rendered since. */
  const latest = useRef<CharacterDoc | null>(null);
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
        if (stored) { latest.current = stored.doc; setDocState(stored.doc); }
        else setMissing(true);
      },
      (error: Error) => current && setLoadError(error.message),
    );
    const onHide = () => {
      if (document.visibilityState === 'hidden') return flush();
      // Back on this tab. If nothing here is waiting to be saved, read the character again: the
      // Discord bot or another device may have changed it, and saving this copy would undo that.
      if (pending.current) return;
      store.get(id).then((stored) => {
        if (!current || !stored || pending.current) return;
        if (JSON.stringify(stored.doc) === JSON.stringify(latest.current)) return;
        latest.current = stored.doc;
        setDocState(stored.doc);
      }, () => { /* offline: keep what is on screen */ });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [store, id, flush]);

  const setDoc = useCallback(
    (next: CharacterDoc, log?: string, small = false) => {
      // A logged change keeps the character as it was, so the History can put it back. A run of
      // small changes (hit points ticking down, a pool being spent) shares one copy: every line
      // is still listed, and Undo is offered at the start of the run.
      if (log) {
        const keep = !small || shouldSnapshot(lastSnapshotAt.current, Date.now());
        if (keep) lastSnapshotAt.current = Date.now();
        void store.log(id, log, keep ? latest.current ?? undefined : undefined);
      }
      latest.current = next;
      setDocState(next);
      pending.current = next;
      setStatus('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [store, id, flush],
  );

  // Each character is pinned to one rules version and only ever sees that handbook.
  const sheet = useMemo(() => (doc ? deriveSheet(doc, ruleSet(doc.rulesVersion).rules) : null), [doc]);

  const live: LiveCharacter | null =
    doc && sheet
      ? { doc, sheet, status, saveError, setDoc, setState: (state, log) => setDoc({ ...doc, state }, log, true) }
      : null;
  return { live, loadError, missing };
}
