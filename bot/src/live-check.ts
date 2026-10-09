// An end-to-end check of the real Supabase project, for the DM, on the machine that holds the service-role key:
//
//   npm run live-check -w bot
//
// It makes two temporary password accounts and a temporary campaign, then signs in as each of them
// through the same public door the website uses and tries what a player may and may not do: profiles,
// characters, campaigns, Devil Fruit secrecy, homebrew, ships, ship pictures. Everything it makes is
// removed again at the end, and it checks that the row counts are back where they started.
//
// It never prints a secret, a join code, or the name or text of any private entry: only counts.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env';

const SITE = process.env.DNDF_SITE ?? 'https://overblaze.github.io/dndf-platform/';
const env = loadEnv();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let failed = 0;
let passed = 0;
function check(what: string, ok: boolean, detail = ''): void {
  if (ok) passed++; else failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
}
const refused = (error: { message: string; code?: string } | null) => Boolean(error);
const short = (error: { message: string } | null) => (error ? error.message.slice(0, 70) : 'no error');

/** The public key the website itself uses, read from the live site. */
async function publicKey(): Promise<string> {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  const page = await (await fetch(SITE)).text();
  const asset = /assets\/index-[^"]+\.js/.exec(page)?.[0];
  if (!asset) throw new Error(`Could not find the app's script on ${SITE}`);
  const key = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(await (await fetch(SITE + asset)).text())?.[0];
  if (!key) throw new Error('Could not find the public key in the live site.');
  return key;
}

const TABLES = ['profiles', 'campaigns', 'campaign_members', 'characters', 'character_history', 'secret_entries', 'grants', 'homebrew', 'ships'] as const;
async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    out[table] = count ?? 0;
  }
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  out.accounts = data.users.length;
  return out;
}

// The smallest picture there is: a 1 by 1 JPEG.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');

const stamp = Date.now().toString(36);
const names = { a: `zz_check_a_${stamp}`, b: `zz_check_b_${stamp}` };
const made: { users: string[]; campaign: string | null; files: string[] } = { users: [], campaign: null, files: [] };

async function cleanUp(): Promise<void> {
  if (made.files.length) await admin.storage.from('ship-pictures').remove(made.files);
  if (made.campaign) await admin.from('campaigns').delete().eq('id', made.campaign);
  for (const id of made.users) await admin.auth.admin.deleteUser(id);
  // Anything an earlier, interrupted run left behind.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data.users) if ((user.email ?? '').startsWith('zz_check_')) await admin.auth.admin.deleteUser(user.id);
  await admin.from('campaigns').delete().like('name', 'zz check %');
}

async function main(): Promise<void> {
  const key = await publicKey();
  const client = () => createClient(env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const before = await counts();
  console.log(`Before: ${TABLES.map((t) => `${t} ${before[t]}`).join(', ')}, accounts ${before.accounts}`);

  // --- The door itself -----------------------------------------------------------------------
  console.log('\nSigning up');
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'join_code').maybeSingle();
  const code = setting?.value?.trim() ?? '';
  check('migration 0008 is in place (there is a join_code setting)', setting !== null && setting !== undefined);
  const door = client();
  const noCode = await door.auth.signUp({ email: `${names.a}@players.dndf.invalid`, password: `pw-${crypto.randomUUID()}` });
  check('a sign-up with no table code is refused', refused(noCode.error) && !noCode.data.user, short(noCode.error));
  const wrong = await door.auth.signUp({ email: `${names.a}@players.dndf.invalid`, password: `pw-${crypto.randomUUID()}`, options: { data: { join_code: `not-${stamp}` } } });
  check('a sign-up with the wrong table code is refused', refused(wrong.error) && !wrong.data.user, short(wrong.error));
  const noCodeAdmin = await admin.auth.admin.createUser({ email: `${names.a}@players.dndf.invalid`, password: `pw-${crypto.randomUUID()}`, email_confirm: true });
  check('even the service role cannot make a password account without the code', refused(noCodeAdmin.error), short(noCodeAdmin.error));
  if (noCodeAdmin.data?.user) made.users.push(noCodeAdmin.data.user.id);
  const dmName = (await admin.from('app_settings').select('value').eq('key', 'dm_bootstrap_discord_username').maybeSingle()).data?.value?.trim().replace(/^@/, '').toLowerCase();
  if (dmName && code) {
    const imp = await admin.auth.admin.createUser({ email: `${dmName}@players.dndf.invalid`, password: `pw-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { join_code: code } });
    check('a password account cannot take the DM’s Discord name, even with the code', refused(imp.error), short(imp.error));
    if (imp.data?.user) made.users.push(imp.data.user.id);
  }
  if (!code) {
    check('a join code is set, so the rest can be checked', false, 'set one with: npm run accounts -w bot -- code <code>');
    return;
  }

  // Two players, made with the code. (Made through the admin door so that no confirmation mail is ever sent.)
  const passwords = { a: `pw-${crypto.randomUUID()}`, b: `pw-${crypto.randomUUID()}` };
  const ids: Record<'a' | 'b', string> = { a: '', b: '' };
  for (const who of ['a', 'b'] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email: `${names[who]}@players.dndf.invalid`, password: passwords[who], email_confirm: true, user_metadata: { join_code: code } });
    if (error || !data.user) throw new Error(`Could not make the test account: ${error?.message}`);
    ids[who] = data.user.id;
    made.users.push(data.user.id);
    check(`test player ${who} made with the code; the code is not kept on the account`, !('join_code' in (data.user.user_metadata ?? {})));
  }
  const a = client();
  const b = client();
  const inA = await a.auth.signInWithPassword({ email: `${names.a}@players.dndf.invalid`, password: passwords.a });
  const inB = await b.auth.signInWithPassword({ email: `${names.b}@players.dndf.invalid`, password: passwords.b });
  check('both sign in with username and password', !inA.error && !inB.error, `${short(inA.error)}; ${short(inB.error)}`);
  const badPw = await client().auth.signInWithPassword({ email: `${names.a}@players.dndf.invalid`, password: 'wrong-password-here' });
  check('a wrong password is refused', refused(badPw.error));

  // --- Profiles ------------------------------------------------------------------------------
  console.log('\nProfiles and DM status');
  const mine = await a.rpc('sync_my_profile');
  check('a password player has a profile under their username, and is not a DM', !mine.error && mine.data?.display_name === names.a && mine.data?.is_dm === false && mine.data?.discord_username === null, short(mine.error));
  await a.from('profiles').update({ is_dm: true }).eq('id', ids.a);
  await a.from('profiles').update({ discord_username: dmName ?? 'x' }).eq('id', ids.a);
  await a.rpc('sync_my_profile');
  const after = await admin.from('profiles').select('is_dm, discord_username').eq('id', ids.a).single();
  check('they cannot make themselves a DM or give themselves a Discord name', after.data?.is_dm === false && after.data?.discord_username === null);
  const seenProfiles = await a.from('profiles').select('id');
  check('a player in no campaign sees only their own profile', !seenProfiles.error && (seenProfiles.data ?? []).every((p) => p.id === ids.a), `${seenProfiles.data?.length} seen`);
  const settings = await a.from('app_settings').select('key, value');
  check('a player cannot read the site settings (join code, DM name)', refused(settings.error) || (settings.data ?? []).length === 0, short(settings.error));
  const settingsWrite = await a.from('app_settings').update({ value: '' }).eq('key', 'join_code').select('key');
  check('or change them', refused(settingsWrite.error) || (settingsWrite.data ?? []).length === 0);
  const anonSettings = await client().from('app_settings').select('key');
  check('nor can a signed-out visitor', refused(anonSettings.error) || (anonSettings.data ?? []).length === 0);

  // --- Characters ----------------------------------------------------------------------------
  console.log('\nCharacters');
  const char = await a.from('characters').insert({ rules_version: 'dndf-10', doc: { name: 'zz check character' } }).select('id').single();
  check('a player can make a character', !char.error && Boolean(char.data?.id), short(char.error));
  const charId = char.data!.id as string;
  check('another player cannot read it', ((await b.from('characters').select('id').eq('id', charId)).data ?? []).length === 0);
  check('or change it', ((await b.from('characters').update({ doc: { name: 'taken' } }).eq('id', charId).select('id')).data ?? []).length === 0);
  check('or delete it', ((await b.from('characters').delete().eq('id', charId).select('id')).data ?? []).length === 0);
  const forged = await b.from('characters').insert({ rules_version: 'dndf-10', owner_id: ids.a, doc: { name: 'forged' } }).select('id');
  check('or make one in someone else’s name', refused(forged.error), short(forged.error));
  check('a signed-out visitor reads no characters', ((await client().from('characters').select('id')).data ?? []).length === 0);

  // --- Campaigns -----------------------------------------------------------------------------
  console.log('\nCampaigns');
  const selfMade = await a.from('campaigns').insert({ name: `zz check ${stamp} self` }).select('id');
  check('a player cannot create a campaign', refused(selfMade.error) || (selfMade.data ?? []).length === 0, short(selfMade.error));
  if (selfMade.data?.[0]) await admin.from('campaigns').delete().eq('id', selfMade.data[0].id);
  const camp = await admin.from('campaigns').insert({ name: `zz check ${stamp}` }).select('id').single();
  if (camp.error) throw new Error(camp.error.message);
  made.campaign = camp.data.id as string;
  const cid = made.campaign;
  check('a player sees no campaign they are not in', ((await a.from('campaigns').select('id')).data ?? []).length === 0);
  const selfJoin = await a.from('campaign_members').insert({ campaign_id: cid, user_id: ids.a, role: 'dm' }).select('user_id');
  check('and cannot add themselves to one', refused(selfJoin.error) || (selfJoin.data ?? []).length === 0, short(selfJoin.error));
  await admin.from('campaign_members').insert({ campaign_id: cid, user_id: ids.a, role: 'player' });
  check('once the DM adds them, they see it', ((await a.from('campaigns').select('id')).data ?? []).length === 1);
  const promote = await a.from('campaign_members').update({ role: 'dm' }).eq('campaign_id', cid).eq('user_id', ids.a).select('role');
  check('a player cannot make themselves DM of it', refused(promote.error) || (promote.data ?? []).length === 0);
  const moved = await a.from('characters').update({ campaign_id: cid }).eq('id', charId).select('id');
  check('they can bring their character into it', !moved.error && (moved.data ?? []).length === 1, short(moved.error));
  const crewOut = await b.rpc('campaign_crew', { cid });
  check('someone outside the campaign gets nothing from the crew list', refused(crewOut.error) || (crewOut.data ?? []).length === 0, short(crewOut.error));
  const crewIn = await a.rpc('campaign_crew', { cid });
  check('a member gets the crew list', !crewIn.error && (crewIn.data ?? []).length === 1, short(crewIn.error));

  // --- Devil Fruits: the rule that matters most ------------------------------------------------
  console.log('\nDevil Fruit secrecy');
  const total = before.secret_entries ?? 0;
  check('there are private entries loaded to keep secret', total > 0, `${total} rows`);
  const none = await a.from('secret_entries').select('key');
  check('a player with no grant receives no private entry at all', !none.error && (none.data ?? []).length === 0, `${none.data?.length ?? '?'} of ${total}`);
  check('nor does a signed-out visitor', ((await client().from('secret_entries').select('key')).data ?? []).length === 0);
  const fruit = await admin.from('secret_entries').select('key').eq('kind', 'devilFruit').eq('audience', 'grant').limit(1).single();
  if (fruit.data) {
    const selfGrant = await a.from('grants').insert({ campaign_id: cid, entry_key: fruit.data.key, character_id: charId }).select('id');
    check('a player cannot grant themselves a fruit', refused(selfGrant.error) || (selfGrant.data ?? []).length === 0, short(selfGrant.error));
    // B becomes the campaign's DM and grants it, the way the DM page does.
    await admin.from('campaign_members').insert({ campaign_id: cid, user_id: ids.b, role: 'dm' });
    const grant = await b.from('grants').insert({ campaign_id: cid, entry_key: fruit.data.key, character_id: charId }).select('id').single();
    check('the campaign’s DM can grant one', !grant.error, short(grant.error));
    const one = await a.from('secret_entries').select('key, kind, audience');
    const fruits = (one.data ?? []).filter((e) => e.kind === 'devilFruit');
    check('the player now receives exactly that one fruit', fruits.length === 1 && fruits[0]!.key === fruit.data.key, `${fruits.length} fruit(s)`);
    check('and nothing meant only for DMs', (one.data ?? []).every((e) => e.audience !== 'dm'), `${one.data?.length} entries in all, by audience: ${JSON.stringify((one.data ?? []).reduce((t: Record<string, number>, e) => { t[e.audience as string] = (t[e.audience as string] ?? 0) + 1; return t; }, {}))}`);
    const dmSees = await b.from('secret_entries').select('key', { count: 'exact', head: true });
    check('the DM reads every private entry', dmSees.count === total, `${dmSees.count} of ${total}`);
    const hidden = await a.rpc('campaign_fruits', { cid });
    check('a player’s view of the table’s fruits shows only revealed ones', !hidden.error && (hidden.data ?? []).every((g: { revealed: boolean; character_id: string }) => g.revealed || g.character_id === charId), short(hidden.error));
    if (grant.data) await b.from('grants').delete().eq('id', grant.data.id);
    const gone = await a.from('secret_entries').select('key');
    check('taken back, the player receives nothing again', (gone.data ?? []).length === 0, `${gone.data?.length}`);
    await admin.from('campaign_members').delete().eq('campaign_id', cid).eq('user_id', ids.b);
    check('and the former DM, a player again elsewhere, reads nothing', ((await b.from('secret_entries').select('key')).data ?? []).length === 0);
  }
  const write = await a.from('secret_entries').insert({ key: `zz@${stamp}`, id: 'zz', kind: 'rule', name: 'zz', book: 'zz', audience: 'grant', data: {} }).select('key');
  check('nobody signed in can add a private entry', refused(write.error) || (write.data ?? []).length === 0, short(write.error));

  // --- Homebrew ------------------------------------------------------------------------------
  console.log('\nHomebrew spells');
  const brew = await a.from('homebrew').insert({ kind: 'spell', name: 'zz check spell', data: {} }).select('id').single();
  check('a player can keep a spell of their own', !brew.error, short(brew.error));
  if (brew.data) {
    check('private to them', ((await b.from('homebrew').select('id').eq('id', brew.data.id)).data ?? []).length === 0);
    await a.from('homebrew').update({ campaign_id: cid }).eq('id', brew.data.id);
    check('shared with a campaign, an outsider still cannot see it', ((await b.from('homebrew').select('id').eq('id', brew.data.id)).data ?? []).length === 0);
  }

  // --- Ships ---------------------------------------------------------------------------------
  console.log('\nShips and their pictures');
  const ship = await a.from('ships').insert({ doc: { schema: 1, name: 'zz check ship', treasury: 100 }, campaign_id: cid }).select('id, updated_at').single();
  check('a member can launch a ship for the campaign', !ship.error, short(ship.error));
  if (ship.data) {
    const sid = ship.data.id as string;
    check('someone outside the campaign cannot see her', ((await b.from('ships').select('id').eq('id', sid)).data ?? []).length === 0);
    check('or change her', ((await b.from('ships').update({ doc: { schema: 1, name: 'taken' } }).eq('id', sid).select('id')).data ?? []).length === 0);
    const file = `${sid}/check-${stamp}.jpg`;
    const pictures = (who: SupabaseClient) => who.storage.from('ship-pictures');
    const outsiderUp = await pictures(b).upload(`${sid}/outsider-${stamp}.jpg`, JPEG, { contentType: 'image/jpeg' });
    check('an outsider cannot add a picture to her', refused(outsiderUp.error), short(outsiderUp.error));
    if (!outsiderUp.error) made.files.push(`${sid}/outsider-${stamp}.jpg`);
    const up = await pictures(a).upload(file, JPEG, { contentType: 'image/jpeg' });
    check('a member can', !up.error, short(up.error));
    if (!up.error) made.files.push(file);
    const down = await pictures(a).download(file);
    check('and gets it back, byte for byte', !down.error && Buffer.from(await down.data!.arrayBuffer()).equals(JPEG), short(down.error));
    check('an outsider cannot download it', refused((await pictures(b).download(file)).error));
    check('or list her folder', ((await pictures(b).list(sid)).data ?? []).length === 0);
    check('or delete it', ((await pictures(b).remove([file])).data ?? []).length === 0);
    const anonDown = await pictures(client()).download(file);
    check('a signed-out visitor cannot download it', refused(anonDown.error));
    const open = await fetch(`${env.SUPABASE_URL}/storage/v1/object/public/ship-pictures/${file}`);
    check('and there is no public address for it', open.status >= 400, `HTTP ${open.status}`);
    const wrongType = await pictures(a).upload(`${sid}/note-${stamp}.txt`, Buffer.from('not a picture'), { contentType: 'text/plain' });
    check('the bucket refuses a file that is not a picture', refused(wrongType.error), short(wrongType.error));
    if (!wrongType.error) made.files.push(`${sid}/note-${stamp}.txt`);
    // The crew joins: B can now see and change her, and two changes at once cannot overwrite each other.
    await admin.from('campaign_members').insert({ campaign_id: cid, user_id: ids.b, role: 'player' });
    const seen = await b.from('ships').select('id, updated_at').eq('id', sid).single();
    check('a crewmate added to the campaign sees her', !seen.error);
    check('and her pictures', !(await pictures(b).download(file)).error);
    const first = await a.from('ships').update({ doc: { schema: 1, name: 'zz check ship', treasury: 150 } }).eq('id', sid).eq('updated_at', ship.data.updated_at).select('updated_at');
    const second = await b.from('ships').update({ doc: { schema: 1, name: 'zz check ship', treasury: 0 } }).eq('id', sid).eq('updated_at', ship.data.updated_at).select('updated_at');
    check('the first of two changes made at once is saved', (first.data ?? []).length === 1);
    check('the second is turned away instead of overwriting it', (second.data ?? []).length === 0);
    await b.from('ships').update({ owner_id: ids.b }).eq('id', sid);
    check('a crewmate cannot take ownership of her', (await admin.from('ships').select('owner_id').eq('id', sid).single()).data?.owner_id === ids.a);
    check('or delete her', ((await b.from('ships').delete().eq('id', sid).select('id')).data ?? []).length === 0);
    const removed = await pictures(a).remove([file]);
    check('a member can take the picture down', !removed.error && (removed.data ?? []).length === 1, short(removed.error));
    if (!removed.error) made.files = made.files.filter((f) => f !== file);
  }

  // --- Passwords -----------------------------------------------------------------------------
  console.log('\nPasswords');
  const newPassword = `pw-${crypto.randomUUID()}`;
  const changed = await a.auth.updateUser({ password: newPassword });
  check('a player can change their own password', !changed.error, short(changed.error));
  check('the old one no longer works', refused((await client().auth.signInWithPassword({ email: `${names.a}@players.dndf.invalid`, password: passwords.a })).error));
  check('the new one does', !(await client().auth.signInWithPassword({ email: `${names.a}@players.dndf.invalid`, password: newPassword })).error);
  const reset = await admin.auth.admin.updateUserById(ids.b, { password: `pw-${crypto.randomUUID()}` });
  check('the DM’s reset tool can set a new one', !reset.error, short(reset.error));

  // --- Put everything back ---------------------------------------------------------------------
  console.log('\nCleaning up');
  await cleanUp();
  made.users = []; made.campaign = null; made.files = [];
  const end = await counts();
  const same = [...TABLES, 'accounts'].filter((t) => t !== 'character_history').every((t) => end[t] === before[t]);
  check('every table is back to its count from before the check', same, [...TABLES, 'accounts'].filter((t) => end[t] !== before[t]).map((t) => `${t} ${before[t]} → ${end[t]}`).join(', ') || 'all the same');
  const left = await admin.storage.from('ship-pictures').list('', { limit: 1000 });
  check('no test picture is left in storage', (left.data ?? []).length === 0 || before.ships! > 0, `${left.data?.length ?? '?'} folder(s)`);
}

try {
  await main();
} catch (error) {
  failed++;
  console.error(`\nStopped early: ${(error as Error).message}`);
} finally {
  try { await cleanUp(); } catch (error) { console.error(`Could not clean up: ${(error as Error).message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
