import { expect, test } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * TEST-E2E-SMOKE-001/002 (STAGE-000). Both surfaces render their SUCCESS state at
 * phone/tablet/laptop, screenshots are saved, and there are no console/network errors.
 * Also proves the API wiring (build info + DB-backed locales) and locale switching.
 */

test.describe('customer web (APP-CWEB)', () => {
  test('home renders (SSR), is API-backed, and switches locale to RTL', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/'); // → 307 → /en
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // the search island is SSR'd with the real location list from the API
    const form = page.getByTestId('search-form');
    await expect(form).toBeVisible();
    await expect(form.getByTestId('search-location').locator('option')).not.toHaveCount(1);

    await shot(page, testInfo, 'cweb-home-default');

    // switch to Arabic via the header <select> → URL segment + RTL (wait for hydration first)
    await page.waitForLoadState('networkidle');
    await page.locator('header select').first().selectOption('ar');
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: /Search|Rechercher|بحث/ })).toBeVisible();
    await shot(page, testInfo, 'cweb-home-rtl');

    guards.assertClean();
  });

  test('unknown route shows a recoverable not-found state', async ({ page }) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/en/nope-does-not-exist');
    await expect(page.locator('[data-appstate="no-results"]')).toBeVisible();
    await expect(page.getByRole('link', { name: /Go home/ })).toBeVisible();
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

  test('after staff sign-in the dashboard shows real KPI cards and the health drill', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill('agent@example.test');
    await page.getByLabel('Password', { exact: false }).fill('DevPassw0rd!');
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    await expect(page.getByRole('heading', { name: 'Operational dashboard' })).toBeVisible();

    // SCREEN-OPS-002 — real, role/location-scoped KPI cards from GET /ops/dashboard. On the
    // seeded DB the call succeeds, so the cards show figures, not the "unavailable" placeholder
    // (FR-RPT-001 — a metric that can't be read shows "unavailable", never 0).
    const stats = page.getByTestId('ops-dash-stats');
    await expect(stats).toBeVisible();
    await expect(stats.getByText('Awaiting assignment')).toBeVisible();
    await expect(stats.getByText('Today’s pickups')).toBeVisible();
    await expect(page.getByTestId('metric-unavailable')).toHaveCount(0);
    await expect(page.getByTestId('ops-dash-fleet')).toBeVisible();

    // Live system-health drill still sits below the KPIs.
    const health = page.getByTestId('health-components');
    await expect(health).toBeVisible();
    await expect(health.locator('[data-component="db"]')).toHaveAttribute('data-status', 'ok');
    await expect(health.locator('[data-component="lookups"]')).toHaveAttribute('data-status', 'ok');

    await shot(page, testInfo, 'ops-dashboard-default');
    guards.assertClean();
  });
});
