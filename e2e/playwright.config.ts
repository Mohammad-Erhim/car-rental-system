import { defineConfig, devices } from '@playwright/test';

/**
 * Web E2E (SRS §17.5). Three responsive classes are separate projects so every critical
 * screenshot exists at phone / tablet / laptop. Traces on first retry; screenshots on failure;
 * console + network assertions live in the specs.
 *
 * Single origin (STAGE-011, DEC-021/026): `apps/site` (Next, :3000) is the browser origin; it
 * proxies `/ops` → the operations dashboard (`apps/web`, `vite preview` :3100) and `/api` +
 * `/health` → the API (:3001). A production build of each is served — lighter on this
 * memory-constrained host than long-lived dev servers.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3100';
const REUSE = !!process.env.E2E_REUSE_SERVER;

export default defineConfig({
  testDir: './tests',
  testIgnore: /qa-matrix\.spec\.ts/,
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  // one retry everywhere: the suite shares a dev DB and this host is memory-constrained, so the
  // heavy `phone` project (isMobile + dsf 3) occasionally trips the 10s expect timeout on a
  // cold re-render. A retry runs the single failed test in a fresh context. CI gets two.
  retries: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  // All three responsive classes run on Chromium (the only engine installable on this host).
  // Firefox/WebKit coverage is a release-hardening item — see STAGE-007. `scripts/verify-e2e.sh`
  // runs the three projects as separate invocations with a `db:reset` between them (the suite
  // shares one DB, workers: 1) — a single all-projects run would starve the fleet by `laptop`.
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: REUSE
    ? []
    : [
        {
          command: 'pnpm --filter @carrental/api start',
          cwd: '..',
          url: `${API_URL}/health/ready`,
          reuseExistingServer: false,
          timeout: 90_000,
          stdout: 'pipe',
          stderr: 'pipe',
          // the whole suite shares one client IP — lift the auth rate cap so the many
          // sign-ins across specs never trip SRS-SEC-015 (the limiter itself is tested in
          // apps/api/test/security.spec.ts).
          env: { ...process.env, RATE_LIMIT_AUTH_MAX: '2000', RATE_LIMIT_AUTH_WINDOW_SEC: '60' },
        },
        {
          command: 'pnpm --filter @carrental/web exec vite preview --port 3100 --strictPort',
          cwd: '..',
          url: `${WEB_URL}/ops/`,
          reuseExistingServer: false,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          // the standalone server, not `next start` (unsupported with output: 'standalone')
          command: 'pnpm --filter @carrental/site start:standalone',
          cwd: '..',
          url: `${BASE_URL}/en`,
          reuseExistingServer: false,
          timeout: 90_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            PORT: '3000',
            API_UPSTREAM: API_URL,
            WEB_UPSTREAM: WEB_URL,
            SITE_URL: BASE_URL,
          },
        },
      ],
});
