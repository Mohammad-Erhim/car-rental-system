import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-002 — Discovery & quote (FLOW-CUS-001).
 *  - SCREEN-CUS-001/002/003: search → priced results → vehicle detail → reserve → held quote.
 *  - No-results: a pickup outside operating hours is surfaced, not a blank page.
 *  - SCREEN-OPS-025: an admin publishes a rate plan → the customer price reflects it, no redeploy.
 *  - SCREEN-OPS-013: fleet inventory renders.
 * Browser timezone is America/New_York (playwright config), matching the seeded airport hours.
 */

const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };

/** A YYYY-MM-DDTHH:MM value N days out at the given local hour, for a datetime-local input. */
function localDateTime(daysAhead: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function runSearch(page: Page, location: string, pickup: string, ret: string) {
  // the search island is a client component — wait for hydration before driving it, otherwise
  // a pre-hydration selectOption is reset to '' on mount and submit fails its own validation.
  await page.waitForLoadState('networkidle');
  const loc = page.getByTestId('search-location');
  await loc.selectOption(location);
  await expect(loc).toHaveValue(location);
  await page.getByTestId('search-pickup-at').fill(pickup);
  await page.getByTestId('search-return-at').fill(ret);
  await page.getByTestId('search-submit').click();
  await expect(page).toHaveURL(/\/search\?/);
}

test.describe('customer discovery (APP-CWEB)', () => {
  test('FLOW-CUS-001: search → priced results → detail → reserve → held quote', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/');
    await expect(page.getByTestId('search-form')).toBeVisible();
    await shot(page, testInfo, 'cweb-home-search');

    await runSearch(page, 'JFK', localDateTime(3, 11), localDateTime(6, 11));

    const list = page.getByTestId('results-list');
    await expect(list).toBeVisible();
    const economy = page.getByTestId('result-economy');
    await expect(economy).toBeVisible();
    // 3 days * $32 + $4.95 fee = $100.95 taxable ; +20% => $121.14
    await expect(page.getByTestId('result-economy-price')).toContainText('121.14');
    await expect(page.getByTestId('result-economy-count')).toContainText(/available/);
    await shot(page, testInfo, 'cweb-search-results');

    await economy.getByRole('link', { name: /View & reserve/ }).click();
    await expect(page).toHaveURL(/\/vehicles\/economy\?/);
    await expect(page.getByTestId('vehicle-features')).toBeVisible();
    await expect(page.getByTestId('detail-total')).toContainText('121.14');
    await shot(page, testInfo, 'cweb-vehicle-detail');

    await page.getByTestId('reserve-button').click();
    await expect(page).toHaveURL(/\/checkout\?quote=/);
    const total = page.getByTestId('quote-total');
    await expect(total).toContainText('121.14');
    await expect(page.getByTestId('hold-timer')).toContainText(/Held for/);

    // quote lines sum to the total — parsing *rendered display text* back into a number for a
    // browser-level assertion, not application money math (which stays integer-minor-units
    // throughout); the rule's target is money handling in app code, not reading a UI string here.
    const cells = await page
      .locator('[data-testid="quote-lines"] tbody tr:not(:last-child) td:last-child')
      .allInnerTexts();
    const sum = cells.reduce(
      // eslint-disable-next-line no-restricted-syntax -- parsing displayed currency text, see comment above
      (a, s) => a + Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100),
      0,
    );
    const totalCents = Math.round(
      // eslint-disable-next-line no-restricted-syntax -- parsing displayed currency text, see comment above
      parseFloat((await total.innerText()).replace(/[^0-9.]/g, '')) * 100,
    );
    expect(sum).toBe(totalCents);

    await shot(page, testInfo, 'cweb-checkout');
    guards.assertClean();
  });

  test('a pickup outside operating hours shows a recoverable no-results state', async ({
    page,
  }) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/');
    // PAR (Europe/Paris) opens 08:00 local, no after-hours. The datetime-local value is read in
    // the browser tz (America/New_York, playwright config); 01:00 NY ≈ 07:00 Paris — before PAR
    // opens — so availability returns a "closed" notice and no bookable options.
    await runSearch(page, 'PAR', localDateTime(4, 1), localDateTime(6, 1));
    await expect(page.locator('[data-appstate="no-results"]')).toBeVisible();
    guards.assertClean();
  });
});

test.describe('operations pricing & fleet (APP-OPS)', () => {
  test('SCREEN-OPS-025: publish a rate plan → customer price reflects it', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    // baseline customer price for compact @ LHR, 2 days
    const pu = localDateTime(20, 11);
    const re = localDateTime(22, 11);
    await page.goto('/');
    await runSearch(page, 'LHR', pu, re);
    const baseline = await page.getByTestId('result-compact-price').innerText();

    // create + publish a compact plan with a run-unique base price (the shared dev DB carries
    // state between the phone/tablet/laptop projects, so the price must differ every run).
    const baseDollars = 15 + (Date.now() % 137); // unique per run on the shared dev DB
    const expectedTotal = ((baseDollars * 2 * 120) / 100).toFixed(2); // 2 days, no fees, +20% tax
    await page.goto('/ops/catalogue/rate-plans');
    await expect(page.getByRole('heading', { name: 'Rate plans' })).toBeVisible();
    const planName = `Compact E2E ${Date.now()}`;
    await page.getByTestId('rp-new').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByTestId('rp-category').click();
    await page.getByRole('option', { name: /Compact/ }).click();
    await sheet.getByTestId('rp-name').fill(planName);
    await sheet.getByTestId('rp-base').fill(`${baseDollars}.00`);
    await sheet.getByRole('button', { name: 'Create draft' }).click();
    await page.getByTestId('rp-tab-drafts').click();
    const row = page.getByRole('row').filter({ hasText: planName });
    await expect(row).toBeVisible();
    await row.click(); // opens the plan's details; Publish opens the confirm showing its effect
    await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
    await page.getByTestId('rp-tab-published').click();
    await expect(page.getByRole('row').filter({ hasText: planName })).toContainText('Published');
    await shot(page, testInfo, 'ops-rate-plans');

    // customer price now reflects the just-published plan, with no redeploy
    await page.goto('/');
    await runSearch(page, 'LHR', pu, re);
    const updated = await page.getByTestId('result-compact-price').innerText();
    expect(updated).not.toBe(baseline);
    expect(updated).toContain(expectedTotal);

    guards.assertClean();
  });

  test('SCREEN-OPS-013: fleet inventory renders units', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    await page.goto('/ops/fleet');
    await expect(page.getByRole('heading', { name: 'Fleet inventory' })).toBeVisible();
    await expect(page.getByTestId('fleet-table')).toBeVisible();
    const rows = page.locator('[data-testid="fleet-rows"] tr');
    expect(await rows.count()).toBeGreaterThan(5);
    // the location filter is a dropdown (option values are the location codes)
    await page.getByLabel('Location', { exact: true }).selectOption('JFK');
    await expect(rows.first()).toContainText('JFK');
    await expect(page).toHaveURL(/[?&]location=JFK/);
    await shot(page, testInfo, 'ops-fleet-inventory');
    guards.assertClean();
  });
});
