// A character's history: one line per logged change, each with the character as it was just
// before, so any line can be undone. Kept in the character_history table when signed in, and in
// this browser's storage otherwise.
import type { CharacterDoc } from '@dndf/engine';

export interface HistoryEntry {
  id: string;
  summary: string;
  /** ISO time the change was made. */
  at: string;
  /** The character before the change. Missing on lines written before snapshots were kept. */
  before?: CharacterDoc;
}

/**
 * A copy of the whole character is a few kilobytes, and a fight can log hundreds of small changes.
 * Small changes made within this long of the last kept copy share it; anything bigger (a level, an
 * edit, a rest, an undo) always keeps its own.
 */
export const SNAPSHOT_GAP_MS = 20_000;
export const shouldSnapshot = (lastAt: number, now: number): boolean => now - lastAt >= SNAPSHOT_GAP_MS;

/** Change logs older than this are removed, here and on the account. A character itself is never removed for its age. */
export const HISTORY_DAYS = 90;
export const withinHistory = (entry: HistoryEntry, now = Date.now()): boolean => now - new Date(entry.at).getTime() <= HISTORY_DAYS * 24 * 60 * 60 * 1000;

/** How many lines this browser keeps for a character. The account keeps the last 90 days. */
export const LOCAL_HISTORY_CAP = 60;

/** The list with a new line on top, trimmed to the cap. */
export function pushHistory(list: HistoryEntry[], entry: HistoryEntry, cap = LOCAL_HISTORY_CAP): HistoryEntry[] {
  return [entry, ...list].slice(0, cap);
}

/** "just now", "5 min ago", "3 h ago", or the date. */
export function ago(at: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Changes made one after another in a short burst (tapping hit points down six times) read as one
 * line each, which is what happened; nothing is merged. This only says whether a line can be undone.
 */
export const canUndo = (entry: HistoryEntry): boolean => entry.before !== undefined;
