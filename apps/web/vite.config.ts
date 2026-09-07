import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': r('./src'),
      // Bundle the shared packages from TS source (Vite/esbuild handles this cleanly).
      // The CJS dist builds exist only for the Node/NestJS side.
      '@carrental/contracts': r('../../packages/contracts/src/index.ts'),
      '@carrental/i18n/react': r('../../packages/i18n/src/react.tsx'),
      '@carrental/i18n': r('../../packages/i18n/src/index.ts'),
      '@carrental/ui/styles.css': r('../../packages/ui/src/styles.css'),
      '@carrental/ui': r('../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
