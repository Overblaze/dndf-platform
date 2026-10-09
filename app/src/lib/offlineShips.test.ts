// The offline layer for an account's ships, against a stand-in for the database that can be switched off.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newShip, type ShipDoc } from '@dndf/engine';
import { loadRules } from '../../../packages/engine/test/load';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); },
  key: (i: number) => [...memory.keys()][i] ?? null, get length() { return memory.size; },
});
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
vi.stubGlobal('navigator', { onLine: true });

const server = { rows: new Map<string, { doc: ShipDoc; updated_at: string; owner_id: string; campaign_id: string | null }>(), online: true, clock: 0 };
const tick = () => `2026-10-09T00:00:${String(++server.clock).padStart(2, '0')}Z`;
vi.mock('./supabase', () => {
  const table = () => {
    const filters: Record<string, string> = {};
    let action: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let body: { doc?: ShipDoc; campaign_id?: string | null } = {};
    const run = () => {
      if (!server.online) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
      const match = [...server.rows.entries()].filter(([id, row]) => (filters.id === undefined || filters.id === id) && (filters.updated_at === undefined || filters.updated_at === row.updated_at));
      if (action === 'update') for (const [id, row] of match) server.rows.set(id, { ...row, ...body, updated_at: tick() } as typeof row);
      if (action === 'insert') { const id = `s${server.rows.size + 1}`; server.rows.set(id, { doc: body.doc!, campaign_id: body.campaign_id ?? null, owner_id: 'me', updated_at: tick() }); return { data: { id, ...server.rows.get(id)! }, error: null }; }
      if (action === 'delete') { for (const [id] of match) server.rows.delete(id); return { data: null, error: null }; }
      return { data: match.map(([id]) => ({ id, ...server.rows.get(id)! })), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, eq: (k: string, v: string) => { filters[k] = v; return q; },
      update: (b: typeof body) => { action = 'update'; body = b; return q; }, insert: (b: typeof body) => { action = 'insert'; body = b; return q; }, delete: () => { action = 'delete'; return q; },
      maybeSingle: async () => { const r = run(); return r.error ? r : { data: (r.data as unknown[])[0] ?? null, error: null }; },
      single: async () => run(),
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { supabase: { from: table }, siteUrl: '' };
});

const { shipStoreFor, ShipChanged } = await import('./ships');
const { sendWaiting, drawer } = await import('./offline');
const rules = loadRules('dndf-10');
let n = 0;
const caravel = (): ShipDoc => ({ ...newShip(rules.get('shipType.caravel')!, 'Going Test', () => `p${++n}`), crew: 8, rations: 2000, treasury: 1000 });
let user = 0;
async function setup() {
  memory.clear(); server.rows.clear(); server.online = true;
  const userId = `sailor-${++user}`;
  const store = shipStoreFor(userId);
  const made = await store.create(caravel(), null);
  const ship = (await store.get(made.id))!;
  return { store, ship, userId, id: made.id };
}
/** What a crewmate does from their own phone, straight on the account. */
const crewmate = (id: string, change: Partial<ShipDoc>) => { const row = server.rows.get(id)!; server.rows.set(id, { ...row, doc: { ...row.doc, ...change }, updated_at: tick() }); };

describe('an account’s ships with no connection', () => {
  beforeEach(() => { server.online = true; });

  it('a ship opened once opens and lists again with the connection gone; launching and scuttling wait for it', async () => {
    const { store, id } = await setup();
    server.online = false;
    expect((await store.get(id))!.doc.name).toBe('Going Test');
    expect((await store.list()).map((s) => s.id)).toEqual([id]);
    await expect(store.get('never-seen')).rejects.toThrow(/offline.*not been opened on this device/);
    await expect(store.create(caravel(), null)).rejects.toThrow(/offline.*cannot be launched/);
    await expect(store.remove(id)).rejects.toThrow(/offline/);
    await expect(store.setCampaign((await store.get(id))!, 'camp')).rejects.toThrow(/offline/);
  });

  it('1,500 rations used offline are kept, shown, and sent when the connection returns', async () => {
    const { store, ship, userId, id } = await setup();
    server.online = false;
    const kept = await store.save(ship, { ...ship.doc, rations: 500 });
    expect(kept).toMatchObject({ unsent: true, doc: { rations: 500 }, updatedAt: ship.updatedAt });
    const again = await store.save(kept, { ...kept.doc, treasury: 400 });
    expect(server.rows.get(id)!.doc).toMatchObject({ rations: 2000, treasury: 1000 }); // the account has not heard
    expect(await store.get(id)).toMatchObject({ unsent: true, doc: { rations: 500, treasury: 400 } });
    expect((await store.list())[0]).toMatchObject({ unsent: true });
    expect(drawer('ships', userId).waiting()).toEqual([{ id, name: 'Going Test', clash: false }]);
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc).toMatchObject({ rations: 500, treasury: 400 });
    expect(drawer('ships', userId).waiting()).toEqual([]);
    expect((await store.get(id))!.unsent).toBeUndefined();
    // The page that made the change still holds the old version; its next save must not be mistaken for a clash.
    const next = await store.save(again, { ...again.doc, crew: 7 });
    expect(next.unsent).toBeUndefined();
    expect(server.rows.get(id)!.doc).toMatchObject({ rations: 500, treasury: 400, crew: 7 });
  });

  it('what the crew changed meanwhile is never overwritten: she is marked, and the save is refused as an unsent one', async () => {
    const { store, ship, userId, id } = await setup();
    server.online = false;
    await store.save(ship, { ...ship.doc, rations: 500 });
    crewmate(id, { treasury: 9999 });
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc).toMatchObject({ rations: 2000, treasury: 9999 }); // untouched
    expect(drawer('ships', userId).waiting()).toEqual([{ id, name: 'Going Test', clash: true }]);
    const opened = (await store.get(id))!;
    expect(opened).toMatchObject({ unsent: true, doc: { rations: 500, treasury: 1000 } });
    const refused = await store.save(opened, opened.doc).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ShipChanged);
    expect((refused as InstanceType<typeof ShipChanged>).unsent).toBe(true);
    const theirs = (refused as InstanceType<typeof ShipChanged>).current;
    expect(theirs.doc.treasury).toBe(9999);
    // "Keep mine": mine goes on top of theirs, judged against theirs.
    store.discardUnsent!(id);
    await store.save(theirs, opened.doc);
    expect(server.rows.get(id)!.doc).toMatchObject({ rations: 500, treasury: 1000 });
    expect(drawer('ships', userId).waiting()).toEqual([]);
  });

  it('“use the crew’s” lets the waiting change go', async () => {
    const { store, ship, userId, id } = await setup();
    server.online = false;
    await store.save(ship, { ...ship.doc, rations: 500 });
    crewmate(id, { treasury: 9999 });
    server.online = true;
    await sendWaiting();
    store.discardUnsent!(id);
    expect(drawer('ships', userId).waiting()).toEqual([]);
    expect(await store.get(id)).toMatchObject({ doc: { rations: 2000, treasury: 9999 } });
  });

  it('two crewmates saving at the same moment while online is still the ordinary refusal, not an offline one', async () => {
    const { store, ship, id } = await setup();
    crewmate(id, { treasury: 5 });
    const refused = await store.save(ship, { ...ship.doc, rations: 1 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ShipChanged);
    expect((refused as InstanceType<typeof ShipChanged>).unsent).toBe(false);
    expect(server.rows.get(id)!.doc).toMatchObject({ rations: 2000, treasury: 5 });
  });

  it('a connection that drops again while sending leaves the change waiting', async () => {
    const { store, ship, userId, id } = await setup();
    server.online = false;
    await store.save(ship, { ...ship.doc, rations: 7 });
    await sendWaiting();
    expect(drawer('ships', userId).waiting()).toHaveLength(1);
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc.rations).toBe(7);
  });
});
