import { defineConfig, devices } from '@playwright/test';

/**
 * STAGE-013 — system-wide QA matrix. `apps/site` (Next, :3000) + `apps/web` /ops (vite preview,
 * :4000, base=/ops/) + the API (:3001). Three viewport projects × the specs' own locale/theme
 * loops give the routes × {en,ar,fr} × {light,dark} × {phone,tablet,laptop} matrix.
 *
 *   pnpm --filter @carrental/e2e exec playwright test --config playwright.qa.config.ts
 */
const API_URL = process.env.QA_API_URL ?? 'http://localhost:3001';
const SITE_URL = process.env.QA_SITE_URL ?? 'http://localhost:3000';
const WEB_URL = process.env.QA_WEB_URL ?? 'http://localhost:4000';
const REUSE = !!process.env.QA_REUSE_SERVER;

export default defineConfig({
  testDir: './tests',
  testMatch: /qa-matrix\.spec\.ts/,
  outputDir: './test-results-qa',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-qa', open: 'never' }],
    ['json', { outputFile: 'test-results-qa/results.json' }],
  ],
  use: {
    baseURL: SITE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 30_000,
    timezoneId: 'America/New_York',
  },
  metadata: { siteUrl: SITE_URL, webUrl: WEB_URL },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } },
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
          command: 'pnpm --filter @carrental/api start:dist',
          cwd: '..',
          url: `${API_URL}/health/ready`,
          reuseExistingServer: true,
          timeout: 90_000,
          env: {
            ...process.env,
            RATE_LIMIT_AUTH_MAX: '2000',
            RATE_LIMIT_AUTH_WINDOW_SEC: '60',
          },
        },
        {
          command: 'pnpm --filter @carrental/site start',
          cwd: '..',
          url: SITE_URL,
          reuseExistingServer: true,
          timeout: 90_000,
          env: { ...process.env, API_UPSTREAM: API_URL, SITE_URL, PORT: '3000' },
        },
        {
          command: 'pnpm --filter @carrental/web exec vite preview --port 4000 --strictPort',
          cwd: '..',
          url: `${WEB_URL}/ops/`,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
});
