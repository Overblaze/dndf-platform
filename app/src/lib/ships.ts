// Where ships are kept. Signed in: the ships table, where a ship put in a campaign is shared by its crew.
// Signed out: this browser. A save goes through only if the ship is still as this page last read it,
// so two crewmates changing the hold at once cannot silently undo each other.
import { normalizeShip, type ShipDoc } from '@dndf/engine';
import { drawer, isNetworkError, onReconnect, sendWaiting, watch } from './offline';
import { supabase } from './supabase';

export interface StoredShip { id: string; doc: ShipDoc; campaignId: string | null; mine: boolean; updatedAt: string; /** True when this is a change made with no connection that has not reached the account yet. */ unsent?: boolean }

/** Thrown when someone else changed the ship first. `current` is the ship as it is now. */
export class ShipChanged extends Error {
  /** True when the change refused was one made with no connection: it is still kept, and the player chooses. */
  unsent = false;
  constructor(public current: StoredShip) { super('The ship was changed by a crewmate.'); }
}

export interface ShipStore {
  local: boolean;
  list(): Promise<StoredShip[]>;
  get(id: string): Promise<StoredShip | null>;
  create(doc: ShipDoc, campaignId: string | null): Promise<StoredShip>;
  save(ship: StoredShip, doc: ShipDoc): Promise<StoredShip>;
  setCampaign(ship: StoredShip, campaignId: string | null): Promise<StoredShip>;
  remove(id: string): Promise<void>;
  /** Drops a change that is waiting to be sent, when the player has chosen the crew's version instead. */
  discardUnsent?(id: string): void;
}

const LOCAL_KEY = 'dndf.ships.v1';
type LocalShips = Record<string, { doc: unknown; updatedAt: string }>;
const readLocal = (): LocalShips => { try { const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as LocalShips) : {}; } catch { return {}; } };
const writeLocal = (ships: LocalShips) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(ships)); } catch { throw new Error('This browser’s storage is full, so the ship was not saved.'); } };
const fromLocal = (id: string, row: { doc: unknown; updatedAt: string } | undefined): StoredShip | null => {
  const doc = row ? normalizeShip(row.doc) : null;
  return doc ? { id, doc, campaignId: null, mine: true, updatedAt: row!.updatedAt } : null;
};

const localStore: ShipStore = {
  local: true,
  list: async () => Object.entries(readLocal()).flatMap(([id, row]) => fromLocal(id, row) ?? []).sort((a, b) => a.doc.name.localeCompare(b.doc.name)),
  get: async (id) => fromLocal(id, readLocal()[id]),
  create: async (doc) => {
    const id = crypto.randomUUID();
    const row = { doc, updatedAt: new Date().toISOString() };
    writeLocal({ ...readLocal(), [id]: row });
    return fromLocal(id, row)!;
  },
  save: async (ship, doc) => {
    const all = readLocal();
    const now = fromLocal(ship.id, all[ship.id]);
    if (now && now.updatedAt !== ship.updatedAt) throw new ShipChanged(now); // another tab
    const row = { doc, updatedAt: new Date().toISOString() };
    writeLocal({ ...all, [ship.id]: row });
    return { ...ship, doc, updatedAt: row.updatedAt };
  },
  setCampaign: async (ship) => ship,
  remove: async (id) => { const all = readLocal(); delete all[id]; writeLocal(all); },
};

function explain(error: { message: string; code?: string }): Error {
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)) {
    return new Error('Ships need one more database table. Run supabase/migrations/0006_ships.sql in the Supabase SQL Editor.');
  }
  if (error.code === '42501') return new Error('The database refused: only a ship’s owner can do that.');
  return new Error(error.message);
}

function remoteStore(userId: string): ShipStore {
  const db = supabase!;
  const columns = 'id, owner_id, campaign_id, doc, updated_at';
  type Row = { id: string; owner_id: string; campaign_id: string | null; doc: unknown; updated_at: string };
  const from = (row: Row): StoredShip | null => {
    const doc = normalizeShip(row.doc);
    return doc ? { id: row.id, doc, campaignId: row.campaign_id, mine: row.owner_id === userId, updatedAt: row.updated_at } : null;
  };
  const get = async (id: string) => {
    const { data, error } = await db.from('ships').select(columns).eq('id', id).maybeSingle();
    if (error) throw explain(error);
    return data ? from(data as Row) : null;
  };
  return {
    local: false,
    async list() {
      const { data, error } = await db.from('ships').select(columns).order('name');
      if (error) throw explain(error);
      return ((data ?? []) as Row[]).flatMap((row) => from(row) ?? []);
    },
    get,
    async create(doc, campaignId) {
      const { data, error } = await db.from('ships').insert({ doc, campaign_id: campaignId }).select(columns).single();
      if (error) throw explain(error);
      const made = from(data as Row);
      if (!made) throw new Error('The ship was saved but could not be read back.');
      return made;
    },
    async save(ship, doc) {
      const { data, error } = await db.from('ships').update({ doc }).eq('id', ship.id).eq('updated_at', ship.updatedAt).select(columns);
      if (error) throw explain(error);
      const row = ((data ?? []) as Row[])[0];
      if (row) return from(row) ?? ship;
      const now = await get(ship.id);
      if (!now) throw new Error('This ship is no longer there. It may have been deleted, or taken out of your campaign.');
      throw new ShipChanged(now);
    },
    async setCampaign(ship, campaignId) {
      const { data, error } = await db.from('ships').update({ campaign_id: campaignId }).eq('id', ship.id).select(columns);
      if (error) throw explain(error);
      const row = ((data ?? []) as Row[])[0];
      return (row && from(row)) || { ...ship, campaignId };
    },
    async remove(id) {
      const { error } = await db.from('ships').delete().eq('id', id);
      if (error) throw explain(error);
    },
  };
}

const OFFLINE = 'You are offline';

/**
 * The account's ships, usable with no connection, in the same way as its characters: every ship read is
 * kept on this device; with no connection the kept copy is shown, and a change is kept beside it and
 * sent when the database answers again, only if she is still as this device last knew her. If the crew
 * changed her meanwhile nothing is overwritten: she is marked, and opening her asks which version stays.
 */
function offlineShips(remote: ShipStore, userId: string): ShipStore {
  const kept = drawer<ShipDoc>('ships', userId);
  watch('ships', kept);
  type Base = { doc: unknown; campaignId: string | null; mine: boolean };
  const keep = (ship: StoredShip) => kept.put(ship.id, { doc: { doc: ship.doc, campaignId: ship.campaignId, mine: ship.mine } satisfies Base, updatedAt: ship.updatedAt, name: ship.doc.name });
  const baseOf = (id: string): StoredShip | null => {
    const now = kept.get(id);
    const base = now?.doc as Base | undefined;
    const doc = base ? normalizeShip(base.doc) : null;
    return now && base && doc ? { id, doc, campaignId: base.campaignId, mine: base.mine, updatedAt: now.updatedAt } : null;
  };
  const shown = (id: string): StoredShip | null => {
    const base = baseOf(id);
    const pending = kept.get(id)?.pending;
    return base && pending ? { ...base, doc: pending.doc, unsent: true } : base;
  };
  // A page holds the version it last saw. When this device itself sends a waiting change behind that page's
  // back, the page's next save must be judged against the version that sending produced, not the one before.
  const moved = new Map<string, string>();
  const current = (ship: StoredShip): StoredShip => {
    let at = ship.updatedAt;
    for (let hop = 0; hop < 50 && moved.has(`${ship.id}|${at}`); hop++) at = moved.get(`${ship.id}|${at}`)!;
    return at === ship.updatedAt ? ship : { ...ship, updatedAt: at };
  };

  const send = async () => {
    for (const { id } of kept.waiting()) {
      const now = kept.get(id);
      const base = baseOf(id);
      if (!now?.pending || now.clash || !base) continue;
      try {
        const saved = await remote.save(base, now.pending.doc);
        moved.set(`${id}|${base.updatedAt}`, saved.updatedAt);
        const after = kept.get(id);
        keep(saved);
        // A newer change may have been kept while this one was on its way: it stays waiting, on top of what was just sent.
        if (after?.pending && after.pending.at !== now.pending.at) kept.put(id, { ...kept.get(id)!, pending: after.pending });
      } catch (error) {
        if (error instanceof ShipChanged) kept.put(id, { ...now, clash: true });
        else if (isNetworkError(error)) return;
      }
    }
  };
  onReconnect(send);
  void sendWaiting();

  return {
    local: false,
    async list() {
      try {
        const list = await remote.list();
        for (const ship of list) if (!kept.get(ship.id)?.pending) keep(ship);
        kept.keepOnly(new Set(list.map((ship) => ship.id)));
        return list.map((ship) => shown(ship.id) ?? ship);
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        return Object.keys(kept.all()).flatMap((id) => shown(id) ?? []).sort((a, b) => a.doc.name.localeCompare(b.doc.name));
      }
    },
    async get(id) {
      try {
        const found = await remote.get(id);
        if (!found) { if (!kept.get(id)?.pending) kept.remove(id); return null; }
        // A change is waiting: show it, still standing on the version it was made from, so that sending it is judged fairly.
        if (kept.get(id)?.pending) return shown(id);
        keep(found);
        return found;
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        const here = shown(id);
        if (!here) throw new Error(`${OFFLINE}, and this ship has not been opened on this device before, so there is no copy of her here.`);
        return here;
      }
    },
    async create(doc, campaignId) {
      try { const made = await remote.create(doc, campaignId); keep(made); return made; } catch (error) {
        if (isNetworkError(error)) throw new Error(`${OFFLINE}, so a ship cannot be launched on your account yet. Launch her when you are back online.`);
        throw error;
      }
    },
    async save(asSeen, doc) {
      const ship = current(asSeen);
      try {
        const saved = await remote.save(ship, doc);
        keep(saved);
        return saved;
      } catch (error) {
        if (error instanceof ShipChanged) {
          const now = kept.get(ship.id);
          if (now?.pending) { kept.put(ship.id, { ...now, pending: { ...now.pending, doc }, clash: true }); error.unsent = true; }
          throw error;
        }
        if (!isNetworkError(error)) throw error;
        const now = kept.get(ship.id);
        const base: Base = (now?.doc as Base | undefined) ?? { doc: ship.doc, campaignId: ship.campaignId, mine: ship.mine };
        const ok = kept.put(ship.id, { doc: base, updatedAt: now?.updatedAt ?? ship.updatedAt, name: doc.name, pending: { doc, at: new Date().toISOString() } });
        if (!ok) throw new Error(`${OFFLINE}, and this browser has no room left to keep the change. It is still on screen: do not close the page until you are back online.`);
        return { ...ship, doc, unsent: true };
      }
    },
    async setCampaign(ship, campaignId) {
      try { const moved = await remote.setCampaign(current(ship), campaignId); if (!kept.get(ship.id)?.pending) keep(moved); return moved; } catch (error) {
        if (isNetworkError(error)) throw new Error(`${OFFLINE}, so who sails her cannot be changed yet.`);
        throw error;
      }
    },
    async remove(id) {
      try { await remote.remove(id); kept.remove(id); } catch (error) {
        if (isNetworkError(error)) throw new Error(`${OFFLINE}, so she cannot be scuttled yet.`);
        throw error;
      }
    },
    discardUnsent(id) {
      const base = baseOf(id);
      if (base) keep(base); else kept.remove(id);
    },
  };
}

// One store for each signed-in player, however many pages ask: it listens for the connection coming back.
let account: { userId: string; store: ShipStore } | null = null;
export function shipStoreFor(userId: string | null): ShipStore {
  if (!userId || !supabase) return localStore;
  if (account?.userId !== userId) account = { userId, store: offlineShips(remoteStore(userId), userId) };
  return account.store;
}
