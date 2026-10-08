// Where ships are kept. Signed in: the ships table, where a ship put in a campaign is shared by its crew.
// Signed out: this browser. A save goes through only if the ship is still as this page last read it,
// so two crewmates changing the hold at once cannot silently undo each other.
import { normalizeShip, type ShipDoc } from '@dndf/engine';
import { supabase } from './supabase';

export interface StoredShip { id: string; doc: ShipDoc; campaignId: string | null; mine: boolean; updatedAt: string }

/** Thrown when someone else changed the ship first. `current` is the ship as it is now. */
export class ShipChanged extends Error {
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

export function shipStoreFor(userId: string | null): ShipStore {
  return userId && supabase ? remoteStore(userId) : localStore;
}
