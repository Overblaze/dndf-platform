import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'app/src/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
