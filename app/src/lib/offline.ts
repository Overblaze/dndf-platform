// What makes things on an account usable with no connection. For each signed-in player this device
// keeps a copy of their characters as the database last gave them, and any change made while the
// database could not be reached. Those changes are sent when it can be reached again, and never over
// the top of a change made somewhere else in the meantime: that is put to the player to choose.
//
// Only what the player may already read is kept: their own characters. A Devil Fruit is never part
// of a saved character, so it is never kept here.
import { useSyncExternalStore } from 'react';

/** True for a failure to reach the server at all, as opposed to the server refusing something. */
export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network|the internet connection appears to be offline/i.test(message);
}

export interface Kept<T> {
  /** The thing as the database held it when this device last read or wrote it. */
  doc: unknown;
  updatedAt: string;
  name: string;
  /** A change made while the database could not be reached, waiting to be sent. */
  pending?: { doc: T; at: string; force?: boolean };
  /** Set when sending the change found that someone else had changed it too: the player must choose. */
  clash?: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;
const changed = () => { version++; cache.clear(); for (const listener of listeners) listener(); };
const cache = new Map<string, unknown>();

/** A small keyed store in this browser, one drawer for each kind of thing and each player. */
export function drawer<T>(kind: string, userId: string) {
  const key = `dndf.offline.${kind}.${userId}`;
  const read = (): Record<string, Kept<T>> => {
    if (cache.has(key)) return cache.get(key) as Record<string, Kept<T>>;
    let all: Record<string, Kept<T>> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) all = raw as Record<string, Kept<T>>;
    } catch { /* unreadable: start again */ }
    cache.set(key, all);
    return all;
  };
  /** Returns false when the browser has no room: the caller must then say the change was not kept. */
  const write = (all: Record<string, Kept<T>>): boolean => {
    try { localStorage.setItem(key, JSON.stringify(all)); } catch { changed(); return false; }
    changed();
    return true;
  };
  return {
    key,
    all: read,
    get: (id: string): Kept<T> | undefined => read()[id],
    put: (id: string, kept: Kept<T>) => write({ ...read(), [id]: kept }),
    remove: (id: string) => { const all = { ...read() }; delete all[id]; return write(all); },
    /** Replaces everything except what still has a change waiting. */
    keepOnly: (ids: Set<string>) => write(Object.fromEntries(Object.entries(read()).filter(([id, kept]) => ids.has(id) || kept.pending))),
    waiting: () => Object.entries(read()).filter(([, kept]) => kept.pending).map(([id, kept]) => ({ id, name: kept.name, clash: kept.clash === true })),
  };
}

const drawers: { waiting: () => { id: string; name: string; clash: boolean }[]; kind: string }[] = [];
export function watch(kind: string, d: { waiting: () => { id: string; name: string; clash: boolean }[] }) {
  if (!drawers.some((x) => x.kind === kind)) drawers.push({ kind, waiting: d.waiting });
  else drawers.find((x) => x.kind === kind)!.waiting = d.waiting;
  changed();
}

export interface Waiting { kind: string; id: string; name: string; clash: boolean }
let snapshot: Waiting[] = [];
let snapshotVersion = -1;
function waitingNow(): Waiting[] {
  if (snapshotVersion !== version) {
    snapshot = drawers.flatMap((d) => d.waiting().map((w) => ({ kind: d.kind, ...w })));
    snapshotVersion = version;
  }
  return snapshot;
}

/** The changes kept on this device that have not been sent yet. Re-renders when that changes. */
export function useWaiting(): Waiting[] {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, waitingNow, waitingNow);
}

/** On signing out: the copies kept for that player go, except changes that have not been sent yet. */
export function forgetKept(userId: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('dndf.offline.') || !key.endsWith(`.${userId}`)) continue;
      const all = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Kept<unknown>>;
      const unsent = Object.fromEntries(Object.entries(all).filter(([, kept]) => kept.pending));
      if (Object.keys(unsent).length) localStorage.setItem(key, JSON.stringify(unsent)); else localStorage.removeItem(key);
    }
  } catch { /* storage refused: nothing was kept anyway */ }
  changed();
}

/** Things that want to try sending when a connection comes back. */
const senders = new Set<() => Promise<void>>();
export function onReconnect(send: () => Promise<void>): () => void {
  senders.add(send);
  return () => senders.delete(send);
}
let sending: Promise<void> | null = null;
/** Sends every change that is waiting, one sender at a time. Safe to call at any moment. */
export function sendWaiting(): Promise<void> {
  sending ??= (async () => { for (const send of senders) { try { await send(); } catch { /* still offline, or refused: it stays waiting */ } } })().finally(() => { sending = null; changed(); });
  return sending;
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void sendWaiting());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void sendWaiting(); });
}
