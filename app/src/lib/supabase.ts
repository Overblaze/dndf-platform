import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** null when the two VITE_SUPABASE_ values are missing (see .env.example). */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // PKCE returns "?code=…" rather than a "#…" fragment, which leaves the hash free for routing.
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      })
    : null;

/** Where Discord sends the player back to: this site's own start page. */
export const siteUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
