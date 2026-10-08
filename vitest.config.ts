import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'app/src/**/*.test.ts', 'bot/test/**/*.test.ts'],
    testTimeout: 30_000,
    // The database tests start an in-memory Postgres and run every migration before the first test;
    // on a busy machine that takes longer than the default ten seconds.
    hookTimeout: 60_000,
  },
});
