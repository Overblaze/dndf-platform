import { deriveSheet } from '@dndf/engine';
import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { ago, canUndo, type HistoryEntry } from '../lib/history';
import { ruleSet } from '../lib/rules';
import type { CharacterStore } from '../lib/store';
import type { LiveCharacter } from '../lib/useCharacter';

/** Every logged change, newest first. Any line can be undone: the character goes back to how it was just before it. */
export function HistoryDialog({ live, store, id, onClose }: { live: LiveCharacter; store: CharacterStore; id: string; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    store.history(id).then((list) => current && setEntries(list), (e: Error) => current && setError(e.message));
    return () => { current = false; };
  }, [store, id]);

  const restore = (entry: HistoryEntry) => {
    if (!entry.before) return;
    live.setDoc(entry.before, `Undid back to before “${entry.summary}”`);
    onClose();
  };
  // What going back would show, so the choice is made with the numbers in view.
  const glance = (entry: HistoryEntry) => {
    const sheet = deriveSheet(entry.before!, ruleSet(entry.before!.rulesVersion).rules);
    return `${sheet.summary} · ${entry.before!.state.hp} of ${sheet.maxHp.value} hit points`;
  };

  return (
    <Dialog title="History" onClose={onClose}>
      <p className="page-ref">
        Newest first. Undo puts the character back to how it was just before that line; everything after it is undone too, and the undo itself is added here, so it can be undone.
        {store.local ? ' This browser keeps the last 60 lines.' : ''}
      </p>
      {error && <p className="notice" role="alert">{error}</p>}
      {!entries && !error && <p>Reading the log…</p>}
      {entries?.length === 0 && <p>Nothing logged yet.</p>}
      <ol className="history-list">
        {(entries ?? []).map((entry) => (
          <li key={entry.id} className="history-row">
            <div>
              <div className="history-summary">{entry.summary}</div>
              <div className="page-ref">{ago(entry.at)}</div>
              {confirming === entry.id && <div className="notice">Go back to: {glance(entry)}?</div>}
            </div>
            {canUndo(entry) && (confirming === entry.id ? (
              <span className="row">
                <button className="btn btn-primary" onClick={() => restore(entry)}>Yes, undo</button>
                <button className="btn" onClick={() => setConfirming(null)}>No</button>
              </span>
            ) : (
              <button className="btn" onClick={() => setConfirming(entry.id)} aria-label={`Undo back to before: ${entry.summary}`}>Undo</button>
            ))}
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
