import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the workflow features, run against an ALREADY RUNNING dev stack (API :3001, web
 * :3100) with the machine's own Chrome — no browser download, no Next.js site needed:
 *
 *   E2E_WEB_URL=http://localhost:3100 pnpm --filter @carrental/e2e exec playwright test -c playwright.workflows.config.ts
 */
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3100';
const chrome = { channel: 'chrome' as const, launchOptions: { args: ['--no-sandbox'] } };

export default defineConfig({
  testDir: './tests',
  testMatch: /workflows\.spec\.ts/,
  outputDir: './test-results-workflows',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], ...chrome, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        ...chrome,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
