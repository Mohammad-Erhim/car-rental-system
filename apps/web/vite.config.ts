import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Where the dev/preview server proxies `/api` and `/health`. Native dev talks to the local
// API on localhost; inside Docker the web container talks to the `api` service.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3001';
const proxy = {
  '/api': { target: proxyTarget, changeOrigin: true },
  '/health': { target: proxyTarget, changeOrigin: true },
};
// Bind-mounted source on some hosts needs polling for file-change events.
const usePolling = process.env.VITE_USE_POLLING === '1';

export default defineConfig({
  base: '/ops/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': r('./src'),
      // Bundle the shared packages from TS source (Vite/esbuild handles this cleanly).
      // The CJS dist builds exist only for the Node/NestJS side.
      '@carrental/contracts': r('../../packages/contracts/src/index.ts'),
      '@carrental/i18n/react': r('../../packages/i18n/src/react.tsx'),
      '@carrental/i18n': r('../../packages/i18n/src/index.ts'),
      '@carrental/theme': r('../../packages/theme/src/index.ts'),
      '@carrental/ui/styles.css': r('../../packages/ui/src/styles.css'),
      '@carrental/ui': r('../../packages/ui/src/index.ts'),
    },
  },
  // The dashboard serves under `/ops`. In every environment the *origin* is the public site
  // (apps/site, :3000) — the edge proxy (prod) / Next dev rewrite (dev) forwards `/ops` here on
  // :3100, so the browser only ever sees one origin and the refresh cookie stays first-party
  // (DEC-021). `/api` + `/health` are proxied straight to the API for standalone runs.
  server: {
    port: 3100,
    strictPort: true,
    host: true,
    proxy,
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
  },
  preview: {
    port: 3100,
    strictPort: true,
    host: true,
    proxy,
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
