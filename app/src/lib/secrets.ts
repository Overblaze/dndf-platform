// The private content one character has been granted. The database decides what comes back:
// a player gets their own fruits and, once they hold one, the advancements for fruit users.
import { NO_SECRETS, type RuleEntry, type Secrets } from '@dndf/engine';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Never throws: with no grants, no table yet, or no connection, the sheet simply has no private content. */
export async function loadSecrets(db: SupabaseClient, characterId: string): Promise<Secrets> {
  try {
    const { data: grants, error } = await db.from('grants').select('entry_key, kind, revealed').eq('character_id', characterId);
    if (error || !grants?.length) return NO_SECRETS;
    const keys = [...new Set(grants.map((g) => g.entry_key as string))];
    const [{ data: entries }, { data: advancements }] = await Promise.all([
      db.from('secret_entries').select('key, data').in('key', keys),
      db.from('secret_entries').select('data').eq('kind', 'fruitAdvancement'),
    ]);
    const isEntry = (value: unknown): value is RuleEntry => Boolean(value) && typeof value === 'object' && typeof (value as RuleEntry).id === 'string' && typeof (value as RuleEntry).name === 'string' && typeof (value as RuleEntry).source?.page === 'number';
    return {
      granted: grants.flatMap((g) => {
        const entry = entries?.find((e) => e.key === g.entry_key)?.data;
        return isEntry(entry) ? [{ key: g.entry_key as string, kind: g.kind === 'knowledge' ? 'knowledge' as const : 'owner' as const, revealed: g.revealed === true, entry }] : [];
      }),
      advancements: (advancements ?? []).map((a) => a.data).filter(isEntry),
    };
  } catch {
    return NO_SECRETS;
  }
}
