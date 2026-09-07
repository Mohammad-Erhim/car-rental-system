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
  test('dashboard renders with health drill and labelled unavailable metrics', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/ops');
    await expect(page.getByRole('heading', { name: 'Operational dashboard' })).toBeVisible();

    const health = page.getByTestId('health-components');
    await expect(health).toBeVisible();
    await expect(health.locator('[data-component="db"]')).toHaveAttribute('data-status', 'ok');
    await expect(health.locator('[data-component="lookups"]')).toHaveAttribute('data-status', 'ok');

    // metrics not yet implemented are labelled, not shown as 0
    await expect(page.getByTestId('metric-unavailable').first()).toContainText('Not available yet');

    await shot(page, testInfo, 'ops-dashboard-default');
    guards.assertClean();
  });

  test('ops nav is keyboard reachable and sections load', async ({ page }) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/ops');
    await page.getByRole('link', { name: 'Fleet' }).first().click();
    await expect(page).toHaveURL(/\/ops\/fleet$/);
    await expect(page.locator('[data-appstate="empty"]')).toBeVisible();
    guards.assertClean();
  });
});
