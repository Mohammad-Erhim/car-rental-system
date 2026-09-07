import { defineConfig, devices } from '@playwright/test';

/**
 * Web E2E (SRS §17.5). Three responsive classes are separate projects so every critical
 * screenshot exists at phone / tablet / laptop. Traces on first retry; screenshots on failure;
 * console + network assertions live in the specs.
 *
 * Servers: the API (:3001) and the built web app served by `vite preview` (:3000). On this
 * memory-constrained host we serve a production build rather than a long-lived dev server.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const REUSE = !!process.env.E2E_REUSE_SERVER;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  // All three responsive classes run on Chromium (the only engine installable on this host).
  // Firefox/WebKit coverage is a release-hardening item — see STAGE-007.
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
          command: 'pnpm --filter @carrental/web preview',
          cwd: '..',
          url: WEB_URL,
          reuseExistingServer: false,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
});
