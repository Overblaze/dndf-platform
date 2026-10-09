// Where a ship's maps and artwork are kept. Signed in: a private storage bucket, in a folder named for
// the ship, which the database opens to whoever can open the ship. Signed out: this browser's own
// database (IndexedDB), since a deck plan is far too big for the small store characters are kept in.
import { shrinkImage, type PreparedImage } from './image';
import { supabase } from './supabase';

/** A deck plan is read zoomed in, so it is kept larger than a sheet background. The bucket refuses anything over 4 MB. */
const MAX_EDGE = 2560;
const MAX_BYTES = 3_500_000;
export const prepareShipPicture = (file: File): Promise<PreparedImage> => shrinkImage(file, MAX_EDGE, MAX_BYTES);

export interface ShipPictureStore {
  /** Stores a picture and returns the reference to keep in the ship. */
  upload(shipId: string, picture: Blob): Promise<string>;
  /** A URL the browser can show, or null if the picture is gone. */
  url(ref: string): Promise<string | null>;
  remove(refs: string[]): Promise<void>;
}

/** Pictures already fetched, by reference, so opening a dialog doesn't fetch them again. */
const urls = new Map<string, string>();
const remember = (ref: string, blob: Blob) => { const url = URL.createObjectURL(blob); urls.set(ref, url); return url; };
const forget = (ref: string) => { const url = urls.get(ref); if (url) URL.revokeObjectURL(url); urls.delete(ref); };

const LOCAL = 'local:';
const DB_NAME = 'dndf-ship-pictures';
const TABLE = 'pictures';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, 1); } catch { reject(new Error('no store')); return; }
    request.onupgradeneeded = () => request.result.createObjectStore(TABLE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('no store'));
  });
}
async function withTable<T>(mode: IDBTransactionMode, work: (table: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(TABLE, mode);
      const request = work(tx.objectStore(TABLE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('failed'));
      tx.onabort = () => reject(tx.error ?? new Error('failed'));
    });
  } finally { db.close(); }
}

const localStore: ShipPictureStore = {
  async upload(_shipId, picture) {
    const ref = `${LOCAL}${crypto.randomUUID()}`;
    try { await withTable('readwrite', (table) => table.put(picture, ref)); } catch {
      throw new Error('This browser could not keep the picture (it may be out of room, or in a private window). Sign in to keep pictures on your account.');
    }
    remember(ref, picture);
    return ref;
  },
  async url(ref) {
    const known = urls.get(ref);
    if (known) return known;
    try {
      const blob = await withTable<unknown>('readonly', (table) => table.get(ref));
      return blob instanceof Blob ? remember(ref, blob) : null;
    } catch { return null; }
  },
  async remove(refs) {
    for (const ref of refs) { forget(ref); try { await withTable('readwrite', (table) => table.delete(ref)); } catch { /* already gone */ } }
  },
};

const BUCKET = 'ship-pictures';
function remoteStore(): ShipPictureStore {
  const pictures = supabase!.storage.from(BUCKET);
  return {
    async upload(shipId, picture) {
      const ref = `${shipId}/${crypto.randomUUID()}.jpg`;
      const { error } = await pictures.upload(ref, picture, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) {
        if (/bucket not found/i.test(error.message)) throw new Error('Ship pictures need one more database file. Run supabase/migrations/0007_ship_pictures.sql in the Supabase SQL Editor.');
        if (/row-level security|unauthorized|not authorized/i.test(error.message)) throw new Error('The database refused the picture. If supabase/migrations/0007_ship_pictures.sql has been run, you may no longer be in this ship’s campaign.');
        throw new Error(`The picture could not be uploaded: ${error.message}`);
      }
      remember(ref, picture);
      return ref;
    },
    async url(ref) {
      const known = urls.get(ref);
      if (known) return known;
      // A picture added while signed out stays in that browser; it is not on the account.
      if (ref.startsWith(LOCAL)) return localStore.url(ref);
      const { data, error } = await pictures.download(ref);
      return error || !data ? null : remember(ref, data);
    },
    async remove(refs) {
      refs.forEach(forget);
      const stored = refs.filter((ref) => !ref.startsWith(LOCAL));
      if (stored.length) await pictures.remove(stored);
    },
  };
}

export function shipPicturesFor(userId: string | null): ShipPictureStore {
  return userId && supabase ? remoteStore() : localStore;
}
