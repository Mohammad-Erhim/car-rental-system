import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * API / integration / migration tests: real PostgreSQL (carrental_test), real Redis DB 1.
 * Run serially (single fork) to keep memory low and avoid schema contention on this host.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup-api.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
