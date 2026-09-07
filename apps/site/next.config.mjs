import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const API_UPSTREAM = process.env.API_UPSTREAM ?? 'http://localhost:3001';
// The ops dashboard (apps/web) runs as its own server under `/ops`. For local dev (and any
// standalone deploy without the edge) we forward `/ops` from here so the two surfaces share one
// origin — the SameSite=Lax refresh cookie then stays first-party (DEC-021). `rewrites()` is
// evaluated at BUILD time, so the prod image build sets WEB_UPSTREAM='' (the edge owns `/ops`
// routing there — see deploy/Dockerfile.site); `next dev` re-evaluates per request.
const WEB_UPSTREAM = process.env.WEB_UPSTREAM ?? 'http://localhost:3100';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: { outputFileTracingRoot: repoRoot },
  poweredByHeader: false,
  transpilePackages: [
    '@carrental/ui',
    '@carrental/theme',
    '@carrental/i18n',
    '@carrental/contracts',
  ],
  eslint: { ignoreDuringBuilds: true }, // lint runs as its own `pnpm lint` step
  images: { formats: ['image/avif', 'image/webp'] },
  async redirects() {
    // legacy singular path from the pre-split apps/web customer tree
    return [
      {
        source: '/:locale/vehicle/:categoryCode',
        destination: '/:locale/vehicles/:categoryCode',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    // same-origin API + health in every environment (DEC-021): the browser calls /api, we proxy.
    const rules = [
      { source: '/api/:path*', destination: `${API_UPSTREAM}/api/:path*` },
      { source: '/health/:path*', destination: `${API_UPSTREAM}/health/:path*` },
    ];
    if (WEB_UPSTREAM) {
      rules.push(
        { source: '/ops', destination: `${WEB_UPSTREAM}/ops/` },
        { source: '/ops/:path*', destination: `${WEB_UPSTREAM}/ops/:path*` },
      );
    }
    return rules;
  },
};
export default nextConfig;
