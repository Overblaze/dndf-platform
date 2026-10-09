// The offline layer for account characters, against a stand-in for the database that can be switched off.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { kaito, type CharacterDoc } from '@dndf/engine';
import { loadRules } from '../../../packages/engine/test/load';
import { isNetworkError } from './offline';

// A browser's storage, for the module under test.
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); },
  key: (i: number) => [...memory.keys()][i] ?? null, get length() { return memory.size; },
});
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
vi.stubGlobal('navigator', { onLine: true });

/** A stand-in for the characters table: rows with a version, and a switch for the connection. */
const server = { rows: new Map<string, { doc: CharacterDoc; updated_at: string }>(), online: true, clock: 0, writes: 0 };
const tick = () => `2026-10-09T00:00:${String(++server.clock).padStart(2, '0')}Z`;
const down = () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } });
vi.mock('./supabase', () => {
  const table = () => {
    const filters: Record<string, string> = {};
    let action: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let body: { doc?: CharacterDoc } = {};
    const run = () => {
      if (!server.online) return down();
      const match = [...server.rows.entries()].filter(([id, row]) => (filters.id === undefined || filters.id === id) && (filters.updated_at === undefined || filters.updated_at === row.updated_at));
      if (action === 'update') { for (const [id] of match) { server.rows.set(id, { doc: body.doc!, updated_at: tick() }); server.writes++; } return { data: match.map(([id]) => ({ id, doc: server.rows.get(id)!.doc, updated_at: server.rows.get(id)!.updated_at })), error: null }; }
      if (action === 'insert') { const id = `c${server.rows.size + 1}`; server.rows.set(id, { doc: body.doc!, updated_at: tick() }); return { data: { id, ...server.rows.get(id)! }, error: null }; }
      if (action === 'delete') { for (const [id] of match) server.rows.delete(id); return { data: null, error: null }; }
      return { data: match.map(([id, row]) => ({ id, ...row })), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, limit: () => q, eq: (k: string, v: string) => { if (k !== 'owner_id') filters[k] = v; return q; },
      update: (b: typeof body) => { action = 'update'; body = b; return q; }, insert: (b: typeof body) => { action = 'insert'; body = b; return q; }, delete: () => { action = 'delete'; return q; },
      maybeSingle: async () => { const r = run(); return r.error ? r : { data: (r.data as unknown[])[0] ?? null, error: null }; },
      single: async () => run(),
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { supabase: { from: table, storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) } }, siteUrl: '' };
});

const { storeFor, ChangedElsewhere } = await import('./store');
const { sendWaiting, drawer, forgetKept } = await import('./offline');
const rules = loadRules('dndf-10');
const hurt = (doc: CharacterDoc, hp: number): CharacterDoc => ({ ...doc, state: { ...doc.state, hp } });
let user = 0;
/** A fresh player with one character on the account, already opened on this device. */
async function setup() {
  memory.clear(); server.rows.clear(); server.online = true; server.writes = 0;
  const userId = `user-${++user}`;
  const store = storeFor(userId);
  const made = await store.create(kaito(rules));
  await store.get(made.id);
  return { store, id: made.id, userId, doc: made.doc };
}

describe('account characters with no connection', () => {
  beforeEach(() => { server.online = true; });

  it('tells a dropped connection from the server refusing', () => {
    for (const m of ['TypeError: Failed to fetch', 'Could not save: TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed']) expect(isNetworkError(new Error(m)), m).toBe(true);
    for (const m of ['new row violates row-level security policy', 'This character was changed somewhere else', 'JWT expired', '']) expect(isNetworkError(new Error(m)), m).toBe(false);
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true);
  });

  it('a character opened once can be opened and listed again with the connection gone', async () => {
    const { store, id } = await setup();
    server.online = false;
    expect((await store.get(id))!.doc.name).toBe('Kaito Rourke');
    expect((await store.list()).map((c) => c.id)).toEqual([id]);
    await expect(store.get('never-seen')).rejects.toThrow(/offline.*not been opened on this device/);
    await expect(store.create(kaito(rules))).rejects.toThrow(/offline.*cannot be added/);
    await expect(store.remove(id)).rejects.toThrow(/offline/);
    expect(await store.history(id)).toEqual([]);
    await expect(store.log(id, 'x')).resolves.toBeUndefined();
  });

  it('a change made offline is kept, shown, and sent when the connection returns', async () => {
    const { store, id, userId, doc } = await setup();
    server.online = false;
    await store.save(id, hurt(doc, 20));
    await store.save(id, hurt(doc, 12)); // the newest replaces the one before
    expect(server.rows.get(id)!.doc.state.hp).toBe(doc.state.hp); // the account has not heard
    expect(await store.get(id)).toMatchObject({ unsent: true, doc: { state: { hp: 12 } } });
    expect((await store.list())[0]).toMatchObject({ unsent: true });
    expect(drawer('characters', userId).waiting()).toEqual([{ id, name: 'Kaito Rourke', clash: false }]);
    // A reload: a new page reads the same storage.
    expect(JSON.parse(memory.get(`dndf.offline.characters.${userId}`)!)[id].pending.doc.state.hp).toBe(12);
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc.state.hp).toBe(12);
    expect(drawer('characters', userId).waiting()).toEqual([]);
    expect(await store.get(id)).toMatchObject({ doc: { state: { hp: 12 } } });
    expect((await store.get(id))!.unsent).toBeUndefined();
    // And the next ordinary save goes straight through.
    await store.save(id, hurt(doc, 30));
    expect(server.rows.get(id)!.doc.state.hp).toBe(30);
  });

  it('a change made elsewhere meanwhile is never overwritten: the character is marked, and the save is refused until the player chooses', async () => {
    const { store, id, userId, doc } = await setup();
    server.online = false;
    await store.save(id, hurt(doc, 5));
    // Meanwhile the Discord bot heals the character on the account.
    server.rows.set(id, { doc: hurt(doc, 60), updated_at: tick() });
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc.state.hp).toBe(60); // untouched
    expect(drawer('characters', userId).waiting()).toEqual([{ id, name: 'Kaito Rourke', clash: true }]);
    // Opening it shows this device's version and marks it unsent; saving it is refused with the other version in hand.
    const opened = await store.get(id);
    expect(opened).toMatchObject({ unsent: true, doc: { state: { hp: 5 } } });
    const refused = await store.save(id, opened!.doc).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ChangedElsewhere);
    expect((refused as InstanceType<typeof ChangedElsewhere>).current.doc.state.hp).toBe(60);
    expect(server.rows.get(id)!.doc.state.hp).toBe(60);
    // "Keep mine": written over it, and nothing is left waiting.
    await store.save(id, opened!.doc, { force: true });
    expect(server.rows.get(id)!.doc.state.hp).toBe(5);
    expect(drawer('characters', userId).waiting()).toEqual([]);
  });

  it('“take theirs” lets the waiting change go', async () => {
    const { store, id, userId, doc } = await setup();
    server.online = false;
    await store.save(id, hurt(doc, 5));
    server.rows.set(id, { doc: hurt(doc, 60), updated_at: tick() });
    server.online = true;
    await sendWaiting();
    store.discardUnsent!(id);
    expect(drawer('characters', userId).waiting()).toEqual([]);
    expect(await store.get(id)).toMatchObject({ doc: { state: { hp: 60 } } });
    expect(server.rows.get(id)!.doc.state.hp).toBe(60);
  });

  it('if only the time on the account moved, not the content, the waiting change is simply sent', async () => {
    const { store, id, doc } = await setup();
    server.online = false;
    await store.save(id, hurt(doc, 9));
    server.rows.set(id, { doc: server.rows.get(id)!.doc, updated_at: tick() }); // touched, nothing changed
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc.state.hp).toBe(9);
  });

  it('a connection that drops again while sending leaves the change waiting, to be sent later', async () => {
    const { store, id, userId, doc } = await setup();
    server.online = false;
    await store.save(id, hurt(doc, 7));
    await sendWaiting(); // still offline
    expect(drawer('characters', userId).waiting()).toHaveLength(1);
    server.online = true;
    await sendWaiting();
    expect(server.rows.get(id)!.doc.state.hp).toBe(7);
  });

  it('signing out removes the copies kept for that player, but not a change that has not been sent', async () => {
    const a = await setup();
    forgetKept(a.userId);
    expect(memory.has(`dndf.offline.characters.${a.userId}`)).toBe(false);
    const b = await setup();
    server.online = false;
    await b.store.save(b.id, hurt(b.doc, 3));
    forgetKept(b.userId);
    expect(Object.keys(JSON.parse(memory.get(`dndf.offline.characters.${b.userId}`)!))).toEqual([b.id]);
    // Another player on the same device sees none of it.
    expect(drawer('characters', 'someone-else').waiting()).toEqual([]);
  });
});
