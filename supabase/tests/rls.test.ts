// Runs the real migrations against an in-memory Postgres (PGlite) with a small
// stand-in for Supabase's auth schema, then checks the rules in CLAUDE.md:
// the bootstrap DM, and who can read or write what.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const migrationsDir = join(import.meta.dirname, '..', 'migrations');

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    raw_user_meta_data jsonb,
    last_sign_in_at timestamptz
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    provider text not null,
    identity_data jsonb,
    updated_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
`;

let db: PGlite;

/** What Supabase Auth does on a Discord sign-in: user row, identity row, then last_sign_in_at. */
async function signIn(username: string, globalName = username, existingId?: string): Promise<string> {
  const identity = JSON.stringify({ full_name: username, name: `${username}#0`, custom_claims: { global_name: globalName } });
  let id = existingId;
  if (!id) {
    const created = await db.query<{ id: string }>(
      `insert into auth.users (raw_user_meta_data) values ($1) returning id`,
      [identity],
    );
    id = created.rows[0]!.id;
    await db.query(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'discord', $2)`, [id, identity]);
  }
  await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [id]);
  return id;
}

type Row = Record<string, any>;

/** Runs one statement as a signed-in user (or as a signed-out visitor when userId is null). */
async function as(userId: string | null, sql: string, params: unknown[] = []): Promise<Row[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    return (await tx.query<Row>(sql, params)).rows;
  });
}

const admin = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows;

let matt: string; // bootstrap DM
let ana: string; // player in the campaign
let ben: string; // player in the campaign
let zed: string; // signed in, not in the campaign
let campaign: string;
let anaChar: string;
let benChar: string;
let zedChar: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  // zed signs in first, before the bootstrap row even exists.
  zed = await signIn('zed');
  await admin(`insert into public.app_settings (key, value) values ('dm_bootstrap_discord_username', 'Matt_Example')`);
  ana = await signIn('ana', 'Ana the Navigator');
  matt = await signIn('matt_example', 'Matt');
  ben = await signIn('ben');

  campaign = (await as(matt, `insert into public.campaigns (name) values ('Grand Line') returning id`))[0]!.id;
  await as(matt, `insert into public.campaign_members (campaign_id, user_id) values ($1, $2), ($1, $3)`, [campaign, ana, ben]);

  const newChar = `insert into public.characters (campaign_id, rules_version, doc) values ($1, $2, $3) returning id`;
  anaChar = (await as(ana, newChar, [campaign, 'dndf-10', { name: 'Kaito Rourke' }]))[0]!.id;
  benChar = (await as(ben, newChar, [campaign, 'dndf-8.8', { name: 'Marlo Vance' }]))[0]!.id;
  zedChar = (await as(zed, newChar, [null, 'dndf-10', { name: 'Loner' }]))[0]!.id;
});

describe('profiles and the bootstrap DM', () => {
  it('creates a profile on sign-up from the Discord identity', async () => {
    const [profile] = await admin(`select * from public.profiles where id = $1`, [ana]);
    expect(profile).toMatchObject({ discord_username: 'ana', display_name: 'Ana the Navigator', is_dm: false });
  });

  it('makes only the bootstrap Discord username a DM, ignoring case', async () => {
    const rows = await admin(`select discord_username, is_dm from public.profiles order by discord_username`);
    expect(rows).toEqual([
      { discord_username: 'ana', is_dm: false },
      { discord_username: 'ben', is_dm: false },
      { discord_username: 'matt_example', is_dm: true },
      { discord_username: 'zed', is_dm: false },
    ]);
  });

  it('never makes the first person to sign in a DM', async () => {
    const [first] = await admin(`select discord_username, is_dm from public.profiles order by created_at limit 1`);
    expect(first).toEqual({ discord_username: 'zed', is_dm: false });
  });

  it('is not fooled by a user editing their own metadata to the DM name', async () => {
    const spoof = JSON.stringify({ full_name: 'matt_example', name: 'matt_example#0' });
    await admin(`update auth.users set raw_user_meta_data = $1, last_sign_in_at = now() where id = $2`, [spoof, zed]);
    await as(zed, `select public.sync_my_profile()`);
    const [profile] = await admin(`select discord_username, is_dm from public.profiles where id = $1`, [zed]);
    expect(profile).toEqual({ discord_username: 'zed', is_dm: false });
  });

  it('does not match an old-style name#1234 handle', async () => {
    const identity = JSON.stringify({ full_name: 'matt_example', name: 'matt_example#4821' });
    const [user] = await admin(`insert into auth.users default values returning id`);
    await admin(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'discord', $2)`, [user!.id, identity]);
    await admin(`update auth.users set last_sign_in_at = now() where id = $1`, [user!.id]);
    expect(await admin(`select is_dm from public.profiles where id = $1`, [user!.id])).toEqual([{ is_dm: false }]);
    await admin(`delete from auth.users where id = $1`, [user!.id]);
  });

  it('grants DM on the next sign-in if the setting was added after the first one', async () => {
    const late = await signIn('late_dm');
    expect(await admin(`select is_dm from public.profiles where id = $1`, [late])).toEqual([{ is_dm: false }]);
    await admin(`update public.app_settings set value = '@Late_DM' where key = 'dm_bootstrap_discord_username'`);
    await signIn('late_dm', 'late_dm', late);
    expect(await admin(`select is_dm from public.profiles where id = $1`, [late])).toEqual([{ is_dm: true }]);
    await admin(`update public.app_settings set value = 'Matt_Example' where key = 'dm_bootstrap_discord_username'`);
    await admin(`delete from auth.users where id = $1`, [late]);
  });

  it('lets a user rename themselves but not make themselves a DM', async () => {
    await as(ana, `update public.profiles set display_name = 'Navigator Ana' where id = $1`, [ana]);
    expect(await as(ana, `select display_name from public.profiles where id = $1`, [ana])).toEqual([
      { display_name: 'Navigator Ana' },
    ]);
    await expect(as(ana, `update public.profiles set is_dm = true where id = $1`, [ana])).rejects.toThrow(/permission denied/);
    await expect(as(ana, `update public.profiles set discord_username = 'matt_example' where id = $1`, [ana])).rejects.toThrow(
      /permission denied/,
    );
    // A later sign-in keeps the name they chose.
    await signIn('ana', 'Ana the Navigator', ana);
    expect(await admin(`select display_name from public.profiles where id = $1`, [ana])).toEqual([{ display_name: 'Navigator Ana' }]);
  });

  it('shows profiles to yourself, your campaign and DMs only', async () => {
    const names = async (who: string) =>
      (await as(who, `select discord_username from public.profiles order by 1`)).map((r) => r.discord_username);
    expect(await names(zed)).toEqual(['zed']);
    expect(await names(ana)).toEqual(['ana', 'ben', 'matt_example']);
    expect(await names(matt)).toEqual(['ana', 'ben', 'matt_example', 'zed']);
  });

  it('keeps app_settings away from every client', async () => {
    await expect(as(matt, `select * from public.app_settings`)).rejects.toThrow(/permission denied/);
    await expect(as(ana, `update public.app_settings set value = 'ana'`)).rejects.toThrow(/permission denied/);
  });
});

describe('campaigns', () => {
  it('makes the creator the campaign DM', async () => {
    const rows = await admin(`select user_id, role from public.campaign_members where campaign_id = $1 and role = 'dm'`, [campaign]);
    expect(rows).toEqual([{ user_id: matt, role: 'dm' }]);
  });

  it('only lets DMs create campaigns', async () => {
    await expect(as(ana, `insert into public.campaigns (name) values ('Mutiny')`)).rejects.toThrow(/row-level security/);
    await expect(as(matt, `insert into public.campaigns (name, created_by) values ('Framed', $1)`, [ana])).rejects.toThrow(
      /row-level security/,
    );
  });

  it('lets members read the campaign and the crew list, and nobody else', async () => {
    expect(await as(ana, `select name from public.campaigns`)).toEqual([{ name: 'Grand Line' }]);
    expect(await as(ana, `select count(*)::int as n from public.campaign_members`)).toEqual([{ n: 3 }]);
    expect(await as(zed, `select name from public.campaigns`)).toEqual([]);
    expect(await as(zed, `select count(*)::int as n from public.campaign_members`)).toEqual([{ n: 0 }]);
  });

  it('only lets the campaign DM change it or its members', async () => {
    expect(await as(ana, `update public.campaigns set name = 'Mine' returning id`)).toEqual([]);
    expect(await as(ana, `update public.campaign_members set role = 'dm' where user_id = $1 returning role`, [ana])).toEqual([]);
    await expect(as(zed, `insert into public.campaign_members (campaign_id, user_id) values ($1, $2)`, [campaign, zed])).rejects.toThrow(
      /row-level security/,
    );
    expect(await as(matt, `update public.campaigns set settings = '{"longRestHitDice":"all"}' returning name`)).toEqual([
      { name: 'Grand Line' },
    ]);
  });
});

describe('characters', () => {
  const visible = async (who: string) => (await as(who, `select name from public.characters order by name`)).map((r) => r.name);

  it('lets players read only their own characters', async () => {
    expect(await visible(ana)).toEqual(['Kaito Rourke']);
    expect(await visible(ben)).toEqual(['Marlo Vance']);
    expect(await visible(zed)).toEqual(['Loner']);
  });

  it('lets the campaign DM read every character in the campaign, and none outside it', async () => {
    expect(await visible(matt)).toEqual(['Kaito Rourke', 'Marlo Vance']);
  });

  it('lets players write their own characters and not a crewmate\'s', async () => {
    const hp = `update public.characters set doc = doc || '{"hp": 1}' where id = $1 returning id`;
    expect(await as(ana, hp, [anaChar])).toHaveLength(1);
    expect(await as(ana, hp, [benChar])).toEqual([]);
    expect(await as(ana, `delete from public.characters where id = $1 returning id`, [benChar])).toEqual([]);
  });

  it('lets the campaign DM write characters in the campaign only', async () => {
    const hp = `update public.characters set doc = doc || '{"hp": 2}' where id = $1 returning id`;
    expect(await as(matt, hp, [benChar])).toHaveLength(1);
    expect(await as(matt, hp, [zedChar])).toEqual([]);
  });

  it('stops players creating characters for someone else or in a campaign they are not in', async () => {
    const insert = `insert into public.characters (owner_id, campaign_id, rules_version) values ($1, $2, 'dndf-10')`;
    await expect(as(ana, insert, [ben, campaign])).rejects.toThrow(/row-level security/);
    await expect(as(zed, insert, [zed, campaign])).rejects.toThrow(/row-level security/);
    await expect(as(ana, `update public.characters set owner_id = $1 where id = $2`, [ben, anaChar])).rejects.toThrow(/row-level security/);
  });

  it('pins every character to dndf-8.8 or dndf-10', async () => {
    await expect(as(ana, `insert into public.characters (rules_version) values ('dndf-9')`)).rejects.toThrow(/check constraint/);
  });

  it('bumps updated_at on every change', async () => {
    const [row] = await admin(`select updated_at > created_at as bumped from public.characters where id = $1`, [anaChar]);
    expect(row).toEqual({ bumped: true });
  });
});

describe('character history', () => {
  const log = `insert into public.character_history (character_id, change) values ($1, $2) returning actor_id`;

  it('records who made a change, for the owner and the DM', async () => {
    expect(await as(ana, log, [anaChar, { hp: [75, 60] }])).toEqual([{ actor_id: ana }]);
    expect(await as(matt, log, [anaChar, { hp: [60, 75] }])).toEqual([{ actor_id: matt }]);
  });

  it('is readable and writable only by people who can see the character', async () => {
    expect(await as(ana, `select count(*)::int as n from public.character_history`)).toEqual([{ n: 2 }]);
    expect(await as(matt, `select count(*)::int as n from public.character_history`)).toEqual([{ n: 2 }]);
    expect(await as(ben, `select count(*)::int as n from public.character_history`)).toEqual([{ n: 0 }]);
    await expect(as(ben, log, [anaChar, { hp: [75, 0] }])).rejects.toThrow(/row-level security/);
    await expect(
      as(ana, `insert into public.character_history (character_id, actor_id, change) values ($1, $2, '{}')`, [anaChar, ben]),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot be rewritten or erased', async () => {
    await expect(as(ana, `update public.character_history set change = '{}'`)).rejects.toThrow(/permission denied/);
    await expect(as(matt, `delete from public.character_history`)).rejects.toThrow(/permission denied/);
  });
});

describe('saving only if nobody else has changed the character', () => {
  // What the website and the bot do: write where the row is still as it was read.
  const save = `update public.characters set doc = $2 where id = $1 and updated_at = $3 returning updated_at::text as updated_at`;
  const read = `select updated_at::text as updated_at, doc from public.characters where id = $1`;

  it('a write against the time just read goes through and gives a new time', async () => {
    const [before] = await as(ana, read, [anaChar]);
    const written = await as(ana, save, [anaChar, { ...(before!.doc as object), note: 'one' }, before!.updated_at]);
    expect(written).toHaveLength(1);
    expect(written[0]!.updated_at).not.toBe(before!.updated_at);
  });

  it('a write against an older time changes nothing: the other change is kept', async () => {
    const [mine] = await as(ana, read, [anaChar]);
    // Someone else (the DM here, standing in for the bot or another tab) saves in between.
    await as(matt, `update public.characters set doc = doc || '{"note": "theirs"}' where id = $1`, [anaChar]);
    const stale = await as(ana, save, [anaChar, { ...(mine!.doc as object), note: 'mine' }, mine!.updated_at]);
    expect(stale).toEqual([]);
    const [now] = await as(ana, read, [anaChar]);
    expect((now!.doc as { note: string }).note).toBe('theirs');
    // Reading again and writing against the new time works.
    expect(await as(ana, save, [anaChar, { ...(now!.doc as object), note: 'mine' }, now!.updated_at])).toHaveLength(1);
  });
});

describe('tidying change logs older than 90 days', () => {
  // What the bot runs once a day, with the service role (here: the database owner).
  const tidy = `delete from public.character_history where at < now() - interval '90 days'`;

  it('removes old lines, keeps recent ones, and never removes a character', async () => {
    const characters = async () => (await admin(`select count(*)::int as n from public.characters`))[0]!.n as number;
    const lines = async (id: string) => (await admin(`select count(*)::int as n from public.character_history where character_id = $1`, [id]))[0]!.n as number;
    const before = await characters();
    const kept = await lines(anaChar);
    await admin(`insert into public.character_history (character_id, actor_id, change, at) values ($1, $2, '{"summary":"long ago"}', now() - interval '200 days'), ($1, $2, '{"summary":"91 days"}', now() - interval '91 days'), ($1, $2, '{"summary":"89 days"}', now() - interval '89 days')`, [anaChar, ana]);
    expect(await lines(anaChar)).toBe(kept + 3);
    await admin(tidy);
    expect(await lines(anaChar)).toBe(kept + 1); // only the 89-day line of the three is left
    expect(await characters()).toBe(before);
    // The character is as it was, and still opens for its owner.
    expect(await as(ana, `select id from public.characters where id = $1`, [anaChar])).toEqual([{ id: anaChar }]);
  });

  it('a character with nothing but old history is still there afterwards, with no history', async () => {
    const [made] = await as(ana, `insert into public.characters (rules_version, doc) values ('dndf-10', '{"name":"Old Salt"}') returning id`);
    const id = made!.id as string;
    await admin(`insert into public.character_history (character_id, actor_id, change, at) values ($1, $2, '{"summary":"created"}', now() - interval '400 days')`, [id, ana]);
    await admin(`update public.characters set updated_at = now() - interval '400 days', created_at = now() - interval '400 days' where id = $1`, [id]).catch(() => {});
    await admin(tidy);
    expect(await admin(`select count(*)::int as n from public.character_history where character_id = $1`, [id])).toEqual([{ n: 0 }]);
    expect(await admin(`select name from public.characters where id = $1`, [id])).toEqual([{ name: 'Old Salt' }]);
  });

  it('removing history cannot remove a character: the link only runs from character to history', async () => {
    const links = await admin(`
      select conrelid::regclass::text as from_table, confrelid::regclass::text as to_table, confdeltype as on_delete
      from pg_constraint where contype = 'f' and (conrelid = 'public.character_history'::regclass or confrelid = 'public.character_history'::regclass)`);
    // Nothing points AT character_history, so deleting its rows cascades nowhere.
    expect(links.filter((l) => l.to_table === 'character_history' || l.to_table === 'public.character_history')).toEqual([]);
    expect(links.some((l) => /characters$/.test(String(l.to_table)) && l.on_delete === 'c')).toBe(true); // deleting a character removes its history
  });
});

describe('private content: Devil Fruits and the grants that open them', () => {
  // Stand-ins: no real fruit is ever in the repository.
  const load = `insert into public.secret_entries (key, id, kind, name, book, audience, data) values ($1, $2, $3, $4, 'Test Book', $5, $6)`;
  const names = async (who: string | null) => (await as(who, `select name from public.secret_entries order by name`)).map((r) => r.name);
  const grant = `insert into public.grants (campaign_id, entry_key, character_id, kind) values ($1, $2, $3, $4) returning id`;
  let anaGrant: string;

  beforeAll(async () => {
    await admin(load, ['devilFruit.alpha@test', 'devilFruit.alpha', 'devilFruit', 'Alpha Fruit', 'grant', { text: 'alpha secret' }]);
    await admin(load, ['devilFruit.beta@test', 'devilFruit.beta', 'devilFruit', 'Beta Fruit', 'grant', { text: 'beta secret' }]);
    await admin(load, ['devilFruit.gamma@test', 'devilFruit.gamma', 'devilFruit', 'Gamma Fruit', 'grant', { text: 'gamma secret' }]);
    await admin(load, ['fruitAdvancement.one@test', 'fruitAdvancement.one', 'fruitAdvancement', 'Fruit Advancement', 'holders', {}]);
    await admin(load, ['rule.dm_chapter@test', 'rule.dm_chapter', 'rule', 'DM Chapter', 'dm', {}]);
  });

  it('with nothing granted, a player reads no private entry at all; the DM reads them all', async () => {
    expect(await names(ana)).toEqual([]);
    expect(await names(ben)).toEqual([]);
    expect(await names(zed)).toEqual([]);
    expect(await names(matt)).toEqual(['Alpha Fruit', 'Beta Fruit', 'DM Chapter', 'Fruit Advancement', 'Gamma Fruit']);
    // Not even a count leaks.
    expect(await as(ana, `select count(*)::int as n from public.secret_entries`)).toEqual([{ n: 0 }]);
    expect(await as(ana, `select name from public.secret_entries where key = 'devilFruit.alpha@test'`)).toEqual([]);
  });

  it('a fruit granted to a character opens that fruit, and the fruit advancements, to its owner only', async () => {
    anaGrant = (await as(matt, grant, [campaign, 'devilFruit.alpha@test', anaChar, 'owner']))[0]!.id;
    expect(await names(ana)).toEqual(['Alpha Fruit', 'Fruit Advancement']);
    expect(await names(ben)).toEqual([]); // a crewmate learns nothing
    expect(await names(zed)).toEqual([]);
    expect(await as(ana, `select data->>'text' as text from public.secret_entries where id = 'devilFruit.alpha'`)).toEqual([{ text: 'alpha secret' }]);
    expect(await as(ana, `select data from public.secret_entries where id = 'devilFruit.beta'`)).toEqual([]);
  });

  it('knowledge of a fruit (an appraisal) opens that fruit but not the fruit advancements', async () => {
    await as(matt, grant, [campaign, 'devilFruit.beta@test', benChar, 'knowledge']);
    expect(await names(ben)).toEqual(['Beta Fruit']);
    expect(await names(ana)).toEqual(['Alpha Fruit', 'Fruit Advancement']);
  });

  it('DM-only entries stay DM-only whatever is granted', async () => {
    await as(matt, grant, [campaign, 'rule.dm_chapter@test', anaChar, 'knowledge']);
    expect(await names(ana)).not.toContain('DM Chapter');
    expect(await names(matt)).toContain('DM Chapter');
  });

  it('the table knows who has a fruit but not which, until it is revealed', async () => {
    const seen = async (who: string) => as(who, `select character_name, revealed, entry_name from public.campaign_fruits($1) order by character_name`, [campaign]);
    expect(await seen(ben)).toEqual([{ character_name: 'Kaito Rourke', revealed: false, entry_name: null }]);
    expect(await seen(ana)).toEqual([{ character_name: 'Kaito Rourke', revealed: false, entry_name: 'Alpha Fruit' }]); // her own
    expect(await seen(matt)).toEqual([{ character_name: 'Kaito Rourke', revealed: false, entry_name: 'Alpha Fruit' }]);
    expect(await seen(zed)).toEqual([]); // not in the campaign: nothing, not even that someone has one
    await as(matt, `update public.grants set revealed = true where id = $1`, [anaGrant]);
    expect(await seen(ben)).toEqual([{ character_name: 'Kaito Rourke', revealed: true, entry_name: 'Alpha Fruit' }]);
    expect(await names(ben)).toEqual(['Alpha Fruit', 'Beta Fruit']); // revealed to the campaign: Ben may now read it
    expect(await names(zed)).toEqual([]); // still nobody outside the campaign
  });

  it('a player sees their own grants and revealed ones; only the campaign DM can make, change or remove one', async () => {
    expect((await as(ana, `select entry_key from public.grants order by entry_key`)).map((r) => r.entry_key)).toEqual(['devilFruit.alpha@test', 'rule.dm_chapter@test']);
    expect((await as(ben, `select entry_key from public.grants order by entry_key`)).map((r) => r.entry_key)).toEqual(['devilFruit.alpha@test', 'devilFruit.beta@test']);
    expect(await as(zed, `select count(*)::int as n from public.grants`)).toEqual([{ n: 0 }]);
    await expect(as(ana, grant, [campaign, 'devilFruit.gamma@test', anaChar, 'owner'])).rejects.toThrow(/row-level security/);
    expect(await as(ana, `update public.grants set revealed = false where id = $1 returning id`, [anaGrant])).toEqual([]);
    expect(await as(ana, `delete from public.grants where id = $1 returning id`, [anaGrant])).toEqual([]);
    expect(await names(ana)).not.toContain('Gamma Fruit');
  });

  it('a DM cannot grant to a character outside the campaign', async () => {
    await expect(as(matt, grant, [campaign, 'devilFruit.gamma@test', zedChar, 'owner'])).rejects.toThrow(/row-level security/);
    expect(await names(zed)).toEqual([]);
  });

  it('nobody signed in can add, change or remove a private entry, the DM included', async () => {
    for (const who of [ana, matt]) {
      await expect(as(who, load, ['devilFruit.x@test', 'devilFruit.x', 'devilFruit', 'X', 'grant', {}])).rejects.toThrow(/permission denied/);
      await expect(as(who, `update public.secret_entries set audience = 'grant'`)).rejects.toThrow(/permission denied/);
      await expect(as(who, `delete from public.secret_entries`)).rejects.toThrow(/permission denied/);
    }
  });

  it('taking a grant away closes the fruit again', async () => {
    await as(matt, `delete from public.grants where id = $1`, [anaGrant]);
    expect(await names(ana)).toEqual([]);
    expect(await names(ben)).toEqual(['Beta Fruit']);
  });

  it('deleting a character removes its grants and nothing else', async () => {
    const [made] = await as(ana, `insert into public.characters (campaign_id, rules_version, doc) values ($1, 'dndf-10', '{"name":"Short Lived"}') returning id`, [campaign]);
    await as(matt, grant, [campaign, 'devilFruit.gamma@test', made!.id, 'owner']);
    expect(await names(ana)).toContain('Gamma Fruit');
    await as(ana, `delete from public.characters where id = $1`, [made!.id]);
    expect(await names(ana)).toEqual([]);
    expect(await admin(`select count(*)::int as n from public.secret_entries`)).toEqual([{ n: 5 }]);
  });
});

describe('signed-out visitors', () => {
  it.each(['app_settings', 'profiles', 'campaigns', 'campaign_members', 'characters', 'character_history', 'secret_entries', 'grants'])(
    'cannot read %s',
    async (table) => {
      await expect(as(null, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    },
  );

  it('cannot call sync_my_profile', async () => {
    await expect(as(null, `select public.sync_my_profile()`)).rejects.toThrow(/permission denied/);
  });
});

describe('sheet background pictures', () => {
  const put = `insert into storage.objects (bucket_id, name) values ('sheet-backgrounds', $1) returning name`;
  const seen = async (who: string | null) => (await as(who, `select name from storage.objects order by name`)).map((r) => r.name);
  let anaFile: string;
  let zedFile: string;

  it('lets a player upload into their own folder only', async () => {
    anaFile = `${ana}/${anaChar}/a.jpg`;
    zedFile = `${zed}/${zedChar}/z.jpg`;
    expect(await as(ana, put, [anaFile])).toHaveLength(1);
    expect(await as(zed, put, [zedFile])).toHaveLength(1);
    await expect(as(ana, put, [`${ben}/${benChar}/sneaky.jpg`])).rejects.toThrow(/row-level security/);
    await expect(as(ana, `insert into storage.objects (bucket_id, name) values ('other', $1)`, [anaFile])).rejects.toThrow(/row-level security/);
    await expect(as(null, put, [`${ana}/${anaChar}/anon.jpg`])).rejects.toThrow(/row-level security/);
  });

  it('shows a picture to its owner and to the DM of that character\'s campaign, and nobody else', async () => {
    expect(await seen(ana)).toEqual([anaFile]);
    expect(await seen(ben)).toEqual([]);
    expect(await seen(matt)).toEqual([anaFile]);
    expect(await seen(zed)).toEqual([zedFile]);
    expect(await seen(null)).toEqual([]);
  });

  it('does not show a DM a file that merely borrows a campaign character\'s id in its path', async () => {
    const borrowed = `${zed}/${anaChar}/z.jpg`;
    await as(zed, put, [borrowed]);
    expect(await seen(matt)).toEqual([anaFile]);
    await as(zed, `delete from storage.objects where name = $1`, [borrowed]);
  });

  it('lets only the owner delete it', async () => {
    expect(await as(matt, `delete from storage.objects where name = $1 returning name`, [anaFile])).toEqual([]);
    expect(await as(ben, `delete from storage.objects where name = $1 returning name`, [anaFile])).toEqual([]);
    expect(await as(ana, `delete from storage.objects where name = $1 returning name`, [anaFile])).toHaveLength(1);
  });

  it('keeps the bucket private, limited to 2 MB images', async () => {
    expect(await admin(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'sheet-backgrounds'`)).toEqual([
      { public: false, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    ]);
  });
});

describe('every table', () => {
  it('has row-level security switched on', async () => {
    const open = await admin(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(open).toEqual([]);
  });
});
