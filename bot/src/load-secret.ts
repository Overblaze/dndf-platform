// Loads the private rules files into the secret_entries table. Run on the DM's machine, after
// migration 0003:
//
//   npm run load-secret --workspace bot -- --dry     count what would be loaded, change nothing
//   npm run load-secret --workspace bot              load (safe to run again: rows are replaced by key)
//
// It prints counts only, never names or text. It never removes a row: an entry that has gone
// from the files stays in the table, because removing it would remove the grants that point at it.
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env';
import { secretRows } from './secret-rows';

const dir = process.env.DNDF_SECRET_DIR ?? join(homedir(), 'dndf', 'secret');
const dry = process.argv.includes('--dry');

const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((file) => {
  const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { entries?: unknown } | unknown[];
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : [];
  return { file, entries: entries as Record<string, unknown>[] };
});
const { rows, skipped, clashes } = secretRows(files);

const tally = (pick: (row: (typeof rows)[number]) => string) => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(pick(row), (counts.get(pick(row)) ?? 0) + 1);
  return [...counts.entries()].sort().map(([name, n]) => `${name} ${n}`).join(', ');
};
console.log(`${files.length} files, ${files.reduce((n, f) => n + f.entries.length, 0)} entries → ${rows.length} rows`);
console.log(`  by kind:     ${tally((r) => r.kind)}`);
console.log(`  by audience: ${tally((r) => r.audience)}`);
console.log(`  by book:     ${tally((r) => r.book)}`);
if (skipped.length) console.log(`  ${skipped.length} entries could not be used (no id, kind or book)`);
if (clashes.length) console.log(`  ${clashes.length} entries share a key with an earlier one and were left out`);

if (dry) {
  console.log('Dry run: nothing was changed.');
} else {
  const env = loadEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((row) => ({ ...row, loaded_at: new Date().toISOString() }));
    const { error } = await db.from('secret_entries').upsert(batch, { onConflict: 'key' });
    if (error) {
      const hint = /relation .* does not exist|could not find the table/i.test(error.message) ? ' Run supabase/migrations/0003_secret_entries.sql first.' : '';
      console.error(`Stopped after ${done} rows: ${error.message}.${hint}`);
      process.exit(1);
    }
    done += batch.length;
  }
  const { count } = await db.from('secret_entries').select('key', { count: 'exact', head: true });
  console.log(`Loaded ${done} rows. The table now holds ${count ?? '?'}.`);
}
