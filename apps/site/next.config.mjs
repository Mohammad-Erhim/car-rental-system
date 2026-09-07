import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const API_UPSTREAM = process.env.API_UPSTREAM ?? 'http://localhost:3001';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  transpilePackages: [
    '@carrental/ui',
    '@carrental/theme',
    '@carrental/i18n',
    '@carrental/contracts',
  ],
  eslint: { ignoreDuringBuilds: true }, // lint runs as its own `pnpm lint` step
  images: { formats: ['image/avif', 'image/webp'] },
  async rewrites() {
    // same-origin API + health in every environment (DEC-021): the browser calls /api, we proxy.
    return [
      { source: '/api/:path*', destination: `${API_UPSTREAM}/api/:path*` },
      { source: '/health/:path*', destination: `${API_UPSTREAM}/health/:path*` },
    ];
  },
};
export default nextConfig;
