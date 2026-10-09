// The table's own background picture, shown behind every page unless a character has chosen a
// background of its own. A site DM uploads it on the DM page (supabase/migrations/0011_app_background.sql).
// It is public: anyone who opens the site sees it, so it is kept by the service worker and its
// address is remembered, and it is there with no connection too.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { shrinkImage } from './image';
import { supabase } from './supabase';

export const APP_BACKGROUND_BUCKET = 'app-background';
/** Long edge and size the picture is shrunk to before it is sent: sharp on a desktop, light on a phone's data. */
const MAX_EDGE = 2400;
const MAX_BYTES = 900_000;
const KEPT = 'dndf.app-background';

/** The address last known, so the picture is there before the database has answered, and offline. */
export function keptBackground(storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  try {
    const kept = storage.getItem(KEPT);
    return kept && /^https:\/\/[^\s"')]+$/.test(kept) ? kept : null;
  } catch {
    return null;
  }
}

export function keepBackground(url: string | null, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): void {
  try {
    if (url) storage.setItem(KEPT, url);
    else storage.removeItem(KEPT);
  } catch {
    // Storage switched off: the picture is simply asked for again next time.
  }
}

const addressOf = (path: string | null) => (path && supabase ? supabase.storage.from(APP_BACKGROUND_BUCKET).getPublicUrl(path).data.publicUrl : null);
const pathOf = (url: string | null) => (url ? decodeURIComponent(url.split('/').pop() ?? '') : null);

interface AppBackground {
  /** The picture's address, or null when the table has none. */
  url: string | null;
  /** DM only. Gives null when done, or why it could not be. */
  upload: (file: File) => Promise<string | null>;
  remove: () => Promise<string | null>;
}

const Context = createContext<AppBackground>({ url: null, upload: async () => 'Not available here.', remove: async () => 'Not available here.' });
export const useAppBackground = () => useContext(Context);

export function AppBackgroundProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(() => (supabase ? keptBackground() : null));

  const settle = useCallback((next: string | null) => {
    setUrl(next);
    keepBackground(next);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    // Asked once on opening. With no connection (or before 0011 is run) the last known picture stays.
    void supabase.from('site_appearance').select('background_path').maybeSingle().then(({ data, error }) => {
      if (live && !error && data) settle(addressOf((data.background_path as string | null) ?? null));
    });
    return () => {
      live = false;
    };
  }, [settle]);

  const point = useCallback(async (path: string | null): Promise<string | null> => {
    if (!supabase) return 'This copy of the site is not connected to the table’s database.';
    const { data, error } = await supabase.from('site_appearance').update({ background_path: path }).eq('id', true).select('background_path');
    if (error) return `It could not be saved (${error.message}).`;
    if (!data?.length) return 'Only the table’s DM can change the table’s picture.';
    return null;
  }, []);

  const value = useMemo<AppBackground>(() => ({
    url,
    upload: async (file) => {
      if (!supabase) return 'This copy of the site is not connected to the table’s database.';
      let blob: Blob;
      try {
        blob = (await shrinkImage(file, MAX_EDGE, MAX_BYTES)).blob;
      } catch (error) {
        return (error as Error).message;
      }
      // A new name every time: the old picture may be kept by browsers for a year, a new address is never stale.
      const path = `${crypto.randomUUID()}.jpg`;
      const sent = await supabase.storage.from(APP_BACKGROUND_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (sent.error) return /row-level security|not authorized|403/i.test(sent.error.message) ? 'Only the table’s DM can change the table’s picture.' : `The picture could not be sent (${sent.error.message}).`;
      const old = pathOf(url);
      const why = await point(path);
      if (why) {
        void supabase.storage.from(APP_BACKGROUND_BUCKET).remove([path]);
        return why;
      }
      if (old && old !== path) void supabase.storage.from(APP_BACKGROUND_BUCKET).remove([old]);
      settle(addressOf(path));
      return null;
    },
    remove: async () => {
      const old = pathOf(url);
      const why = await point(null);
      if (why) return why;
      if (old && supabase) void supabase.storage.from(APP_BACKGROUND_BUCKET).remove([old]);
      settle(null);
      return null;
    },
  }), [url, point, settle]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
