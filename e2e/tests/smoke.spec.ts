import { expect, test } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * TEST-E2E-SMOKE-001/002 (STAGE-000). Both surfaces render their SUCCESS state at
 * phone/tablet/laptop, screenshots are saved, and there are no console/network errors.
 * Also proves the API wiring (build info + DB-backed locales) and locale switching.
 */

test.describe('customer web (APP-CWEB)', () => {
  test('home renders, loads API data, and switches locale', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // API-backed content
    await expect(page.getByTestId('build-info')).toContainText('carrental-api');
    const localeList = page.getByTestId('locale-list');
    await expect(localeList).toContainText('English');
    await expect(localeList).toContainText('العربية');

    // health chip resolved to a real status
    await expect(page.getByTestId('system-status')).toHaveAttribute(
      'data-status',
      /ok|degraded|down/,
    );

    await shot(page, testInfo, 'cweb-home-default');

    // switch to Arabic -> RTL
    await page
      .getByRole('button', { name: /Current language|Langue actuelle|اللغة الحالية/ })
      .click();
    await page.getByRole('menuitem', { name: /العربية/ }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: /Search|Rechercher|بحث/ })).toBeVisible();
    await shot(page, testInfo, 'cweb-home-rtl');

    guards.assertClean();
  });

  test('unknown route shows a recoverable not-found state', async ({ page }) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/nope-does-not-exist');
    await expect(page.locator('[data-appstate="no-results"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Go home/ })).toBeVisible();
    guards.assertClean();
  });
});

test.describe('operations dashboard (APP-OPS)', () => {
  test('an anonymous visitor to /ops is sent to staff sign-in', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/ops');
    await expect(page).toHaveURL(/\/ops\/sign-in$/);
    await expect(page.getByRole('heading', { name: /Staff sign in/ })).toBeVisible();
    await shot(page, testInfo, 'ops-signin');
    guards.assertClean();
  });

  test('after staff sign-in the dashboard shows the health drill and labelled unavailable metrics', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill('agent@example.test');
    await page.getByLabel('Password', { exact: false }).fill('DevPassw0rd!');
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    await expect(page.getByRole('heading', { name: 'Operational dashboard' })).toBeVisible();
    const health = page.getByTestId('health-components');
    await expect(health).toBeVisible();
    await expect(health.locator('[data-component="db"]')).toHaveAttribute('data-status', 'ok');
    await expect(health.locator('[data-component="lookups"]')).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('metric-unavailable').first()).toContainText('Not available yet');

    await shot(page, testInfo, 'ops-dashboard-default');
    guards.assertClean();
  });
});
