import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': r('./src'),
      '@carrental/contracts': r('../../packages/contracts/src/index.ts'),
      '@carrental/i18n/react': r('../../packages/i18n/src/react.tsx'),
      '@carrental/i18n': r('../../packages/i18n/src/index.ts'),
      '@carrental/ui/styles.css': r('../../packages/ui/src/styles.css'),
      '@carrental/ui': r('../../packages/ui/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
