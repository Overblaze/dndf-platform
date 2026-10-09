import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { siteUrl, supabase } from './supabase';

export interface Profile {
  id: string;
  discord_username: string | null;
  display_name: string | null;
  is_dm: boolean;
}

/**
 * A player without Discord signs in with a username and a password. Supabase Auth only knows email
 * addresses, so the username is sent as an address at a made-up domain. No mail is ever sent there.
 */
const USERNAME_DOMAIN = 'players.dndf.invalid';
export const USERNAME_RULE = '3 to 24 letters, numbers, dots, dashes or underscores';
export const PASSWORD_MIN = 8;
export const cleanUsername = (raw: string) => raw.trim().toLowerCase();
export const validUsername = (raw: string) => /^[a-z0-9][a-z0-9._-]{2,23}$/.test(cleanUsername(raw));
const addressFor = (username: string) => `${cleanUsername(username)}@${USERNAME_DOMAIN}`;

interface AuthState {
  /** false when the Supabase URL and anon key are not set. */
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** The name to show: from the profile or, failing that, from Discord itself or the username signed in with. */
  name: string | null;
  /** Signed in with a username and password rather than Discord. */
  passwordAccount: boolean;
  isDm: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  /** These three answer with what went wrong, in words for the player, or null when it worked. */
  signInWithPassword: (username: string, password: string) => Promise<string | null>;
  join: (username: string, password: string, code: string) => Promise<string | null>;
  changePassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Supabase sends a failed sign-in back as ?error=…&error_description=… */
function errorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('error_description') ?? params.get('error');
}

function discordName(session: Session | null): string | null {
  const meta = session?.user.user_metadata;
  if (!meta) return null;
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return pick(meta.custom_claims?.global_name) ?? pick(meta.full_name) ?? pick(meta.name)?.replace(/#0$/, '') ?? null;
}

function usernameOf(session: Session | null): string | null {
  const email = session?.user.email;
  return email?.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : null;
}

/** Whether Supabase lets a new password account sign in straight away. If that can't be found out, the sign-up is tried anyway. */
async function passwordAccountsReady(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return true;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!response.ok) return true;
    const settings = (await response.json()) as { mailer_autoconfirm?: boolean };
    return settings.mailer_autoconfirm !== false;
  } catch { return true; }
}

const unreachable = (message: string) => (/failed to fetch|network/i.test(message) ? 'The sign-in service could not be reached. Check your connection and try again.' : null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabase !== null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(errorFromUrl);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Refresh the profile row (and DM status) from the database whenever the signed-in user changes.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    setProfile(null);
    if (!supabase || !userId) return;
    let current = true;
    supabase.rpc('sync_my_profile').then(({ data, error: rpcError }) => {
      if (!current) return;
      if (rpcError) {
        setError(`Signed in, but the database did not answer: ${rpcError.message}. Have the SQL migrations been run?`);
      } else {
        setProfile(data as Profile);
      }
    });
    return () => {
      current = false;
    };
  }, [userId]);

  const signIn = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: siteUrl, scopes: 'identify' },
    });
    if (signInError) setError(signInError.message);
  }, []);

  const signInWithPassword = useCallback(async (username: string, password: string) => {
    if (!supabase) return 'Signing in is not set up on this site.';
    setError(null);
    const { error: failed } = await supabase.auth.signInWithPassword({ email: addressFor(username), password });
    if (!failed) return null;
    if (/invalid login credentials/i.test(failed.message)) return 'That username and password don’t match an account. Usernames made here are not Discord names.';
    if (/email not confirmed/i.test(failed.message)) return 'This account was made before password sign-in was fully switched on. Ask your DM to turn off “Confirm email” in Supabase and make the account again.';
    return unreachable(failed.message) ?? failed.message;
  }, []);

  const join = useCallback(async (username: string, password: string, code: string) => {
    if (!supabase) return 'Signing in is not set up on this site.';
    setError(null);
    // With "Confirm email" still on, an account would be made that can never be used (its address is made up),
    // and Supabase would try to send mail to it. So that is checked before anything is created.
    if (!(await passwordAccountsReady())) return 'Password accounts are not switched on yet. Your DM needs to turn off “Confirm email” in Supabase (Authentication → Sign In / Providers → Email).';
    const { data, error: failed } = await supabase.auth.signUp({ email: addressFor(username), password, options: { data: { join_code: code.trim() } } });
    if (failed) {
      if (/already registered|already been registered|user_already_exists/i.test(`${failed.message} ${failed.code ?? ''}`)) return 'That username is taken. If it is yours, sign in instead.';
      // The database's own check (migration 0008) refuses the new account and says why.
      if (/wrong table code/i.test(failed.message)) return 'That table code is not right. Check it with your DM; capital letters don’t matter.';
      if (/name is taken/i.test(failed.message)) return 'That name is one a player at this table already goes by. Pick another username.';
      if (/not open/i.test(failed.message)) return 'Your DM has not opened password accounts yet: there is no table code set.';
      // Older Supabase versions pass on only that the database refused.
      if (/database error/i.test(failed.message)) return 'The account was not made. Either the table code is not right, the name is one a player here already goes by, or your DM has not opened password accounts yet.';
      if (/signups? (are )?(not allowed|disabled)/i.test(failed.message)) return 'New accounts are switched off for this site. Ask your DM.';
      if (/password/i.test(failed.message)) return `Supabase would not take that password: ${failed.message}`;
      if (/email/i.test(failed.message)) return `Supabase would not take that username (${failed.message}). Tell your DM.`;
      return unreachable(failed.message) ?? failed.message;
    }
    if (!data.session) return 'The account was made, but it can’t be used yet: your DM needs to turn off “Confirm email” in Supabase (Authentication → Sign In / Providers → Email).';
    return null;
  }, []);

  const changePassword = useCallback(async (password: string) => {
    if (!supabase) return 'Signing in is not set up on this site.';
    const { error: failed } = await supabase.auth.updateUser({ password });
    return failed ? (unreachable(failed.message) ?? failed.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      configured: supabase !== null,
      loading,
      session,
      profile,
      name: profile?.display_name ?? profile?.discord_username ?? discordName(session) ?? usernameOf(session),
      passwordAccount: session?.user.app_metadata?.provider === 'email',
      isDm: profile?.is_dm ?? false,
      error,
      signIn,
      signInWithPassword,
      join,
      changePassword,
      signOut,
    }),
    [loading, session, profile, error, signIn, signInWithPassword, join, changePassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
