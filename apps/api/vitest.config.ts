import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Unit tests: fast, no DB, no server. */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.e2e-spec.ts', 'node_modules/**', 'dist/**'],
    globals: true,
  },
});
