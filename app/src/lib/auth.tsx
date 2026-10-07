import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { siteUrl, supabase } from './supabase';

export interface Profile {
  id: string;
  discord_username: string | null;
  display_name: string | null;
  is_dm: boolean;
}

interface AuthState {
  /** false when the Supabase URL and anon key are not set. */
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** The Discord name to show, from the profile or, failing that, from Discord itself. */
  name: string | null;
  isDm: boolean;
  error: string | null;
  signIn: () => Promise<void>;
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
      name: profile?.display_name ?? profile?.discord_username ?? discordName(session),
      isDm: profile?.is_dm ?? false,
      error,
      signIn,
      signOut,
    }),
    [loading, session, profile, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
