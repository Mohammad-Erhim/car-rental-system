import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-003 — Booking & payment (FLOW-CUS-001 booking half).
 *  - search → results → detail → reserve → checkout → pay (approve) → confirmation with a
 *    reference; the trip then appears under "Your trips".
 *  - a declined card shows an error and no confirmation; the customer can retry.
 * Browser timezone is America/New_York (playwright config).
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };

function localDateTime(daysAhead: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
  await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function toCheckout(page: Page, category = 'economy') {
  await page.goto('/');
  await page.getByTestId('search-location').selectOption('JFK');
  await page.getByTestId('search-pickup-at').fill(localDateTime(6, 11));
  await page.getByTestId('search-return-at').fill(localDateTime(9, 11));
  await page.getByTestId('search-submit').click();
  await expect(page).toHaveURL(/\/search\?/);
  await page
    .getByTestId(`result-${category}`)
    .getByRole('link', { name: /View & reserve/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/vehicle/${category}\\?`));
  await page.getByTestId('reserve-button').click();
  await expect(page).toHaveURL(/\/checkout\?quote=/);
}

test.describe('customer booking (APP-CWEB)', () => {
  test('FLOW-CUS-001: reserve → checkout → pay → confirmation → appears in trips', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await signIn(page);
    await toCheckout(page, 'economy');

    const total = await page.getByTestId('quote-total').innerText();
    await page.getByLabel('Primary driver name', { exact: false }).fill('Dana Driver');
    await page.getByLabel('Email for the confirmation', { exact: false }).fill('dana@example.test');
    await page.getByLabel('Driving licence number', { exact: false }).fill('D-1234567');
    await page.getByTestId('co-card').selectOption('tok_visa_ok');
    await page.getByTestId('co-terms').check();
    await shot(page, testInfo, 'cweb-checkout-form');

    await page.getByTestId('co-pay').click();

    await expect(page.getByTestId('confirm-state')).toContainText('confirmed');
    const ref = await page.getByTestId('confirm-ref').innerText();
    expect(ref).toMatch(/^RES-/);
    await expect(page.getByTestId('confirm-total')).toContainText(total.replace(/[^0-9.]/g, ''));
    // confirmation lines sum to the total
    const cells = await page
      .locator('[data-testid="confirm-lines"] tbody tr:not(:last-child) td:last-child')
      .allInnerTexts();
    const sum = cells.reduce(
      (a, s) => a + Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100),
      0,
    );
    const totalCents = Math.round(
      parseFloat((await page.getByTestId('confirm-total').innerText()).replace(/[^0-9.]/g, '')) *
        100,
    );
    expect(sum).toBe(totalCents);
    await shot(page, testInfo, 'cweb-confirmation');

    await page.goto('/trips');
    await expect(page.getByTestId('trips-list')).toBeVisible();
    await expect(page.getByTestId(`trip-${ref}`)).toBeVisible();
    await shot(page, testInfo, 'cweb-trips');

    guards.assertClean();
  });

  test('a declined card shows an error and no confirmation; retry with a good card works', async ({
    page,
  }) => {
    const guards = attachConsoleGuards(page);
    await signIn(page);
    await toCheckout(page, 'compact');

    await page.getByLabel('Primary driver name', { exact: false }).fill('Rey Renter');
    await page.getByTestId('co-card').selectOption('tok_decline');
    await page.getByTestId('co-terms').check();
    await page.getByTestId('co-pay').click();

    await expect(page.getByTestId('co-error')).toContainText(/declined/i);
    await expect(page.getByTestId('confirm-ref')).toHaveCount(0);

    // retry with an approving card on the same held quote
    await page.getByTestId('co-card').selectOption('tok_visa_ok');
    await page.getByTestId('co-pay').click();
    await expect(page.getByTestId('confirm-state')).toContainText('confirmed');

    guards.assertClean();
  });
});
