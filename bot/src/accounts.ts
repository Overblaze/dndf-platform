// For the DM, on the machine that holds the service-role key: the accounts of players who sign in with a
// username and password instead of Discord. They have no email, so this is how a forgotten password is replaced.
//
//   npm run accounts -w bot                       who has a password account, and the table's join code status
//   npm run accounts -w bot -- code <new code>    set the join code (use "" to close sign-ups)
//   npm run accounts -w bot -- reset <username>   give that player a new temporary password
//   npm run accounts -w bot -- remove <username>  delete that account and everything it owns
import { randomInt } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';
import { loadEnv } from './env';

const env = loadEnv();
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function passwordAccounts(): Promise<User[]> {
  const found: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    found.push(...data.users.filter((u) => u.app_metadata?.provider === 'email'));
    if (data.users.length < 200) return found;
  }
}
const usernameOf = (user: User) => (user.email ?? '').split('@')[0]!;
async function find(username: string): Promise<User> {
  const wanted = username.trim().toLowerCase();
  const user = (await passwordAccounts()).find((u) => usernameOf(u) === wanted);
  if (!user) throw new Error(`No password account is called "${wanted}". Run this with no arguments to see them all.`);
  return user;
}

/** Easy to read aloud and type on a phone: no 0/O or 1/l. */
function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

const [action, ...rest] = process.argv.slice(2);
try {
  if (!action) {
    const { data: setting, error } = await db.from('app_settings').select('value').eq('key', 'join_code').maybeSingle();
    if (error) throw new Error(error.message);
    console.log(setting === null ? 'Password accounts are not set up: run supabase/migrations/0008_password_accounts.sql.'
      : setting.value.trim() ? 'A join code is set: players who know it can make a password account.' : 'No join code is set, so nobody can make a password account.');
    const users = await passwordAccounts();
    console.log(users.length ? `Password accounts (${users.length}):` : 'Nobody has a password account yet.');
    for (const u of users) console.log(`  ${usernameOf(u)}   made ${u.created_at.slice(0, 10)}, last signed in ${u.last_sign_in_at?.slice(0, 10) ?? 'never'}`);
  } else if (action === 'code') {
    if (rest.length !== 1) throw new Error('Give the new code as one word, in quotes if it has spaces. Use "" to close sign-ups.');
    const code = rest[0]!.trim();
    const { data, error } = await db.from('app_settings').update({ value: code }).eq('key', 'join_code').select('key');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('There is no join_code setting yet: run supabase/migrations/0008_password_accounts.sql first.');
    console.log(code ? 'The join code is set. Tell it to your players; capitals do not matter.' : 'The join code is cleared: nobody can make a password account until you set one.');
  } else if (action === 'reset' && rest.length === 1) {
    const user = await find(rest[0]!);
    const password = temporaryPassword();
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error(error.message);
    console.log(`${usernameOf(user)} has a new password:\n\n    ${password}\n\nGive it to them privately. They can change it by tapping their name at the top of the site.`);
  } else if (action === 'remove' && rest.length === 1) {
    const user = await find(rest[0]!);
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw new Error(error.message);
    console.log(`${usernameOf(user)} is removed, along with their characters.`);
  } else {
    throw new Error('Use: accounts | accounts code <new code> | accounts reset <username> | accounts remove <username>');
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
