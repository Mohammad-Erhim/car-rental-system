import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-004 — Reservation operations.
 *  - FLOW-CUS-005: from Trips → reservation detail → cancel → state becomes cancelled, history
 *    records it, the refund is shown.
 *  - FLOW-CUS-004: reservation detail → change the return date → the delta is charged, the total
 *    updates, history records a "modified" event.
 *  - SCREEN-OPS-004: the operations reservation queue renders.
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };
const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };

function localDateTime(daysAhead: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function signInCustomer(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
  await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Book an economy car from JFK and return its RES- reference. */
async function bookViaUi(page: Page, pickupDaysAhead: number, days = 3): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // let the client search island hydrate
  const loc = page.getByTestId('search-location');
  await loc.selectOption('JFK');
  await expect(loc).toHaveValue('JFK');
  await page.getByTestId('search-pickup-at').fill(localDateTime(pickupDaysAhead, 11));
  await page.getByTestId('search-return-at').fill(localDateTime(pickupDaysAhead + days, 11));
  await page.getByTestId('search-submit').click();
  await expect(page).toHaveURL(/\/search\?/);
  await page
    .getByTestId('result-economy')
    .getByRole('link', { name: /View & reserve/ })
    .click();
  await expect(page).toHaveURL(/\/vehicles\/economy\?/);
  await expect(page.getByTestId('reserve-button')).toBeEnabled();
  await page.getByTestId('reserve-button').click();
  await expect(page).toHaveURL(/\/checkout\?quote=/);
  await page.getByLabel('Primary driver name', { exact: false }).fill('Ops Tester');
  await page.getByLabel('Email for the confirmation', { exact: false }).fill('ops@example.test');
  await page.getByTestId('co-card').selectOption('tok_visa_ok');
  await page.getByTestId('co-terms').check();
  await page.getByTestId('co-pay').click();
  await expect(page.getByTestId('confirm-state')).toContainText('confirmed');
  return page.getByTestId('confirm-ref').innerText();
}

test.describe('customer reservation ops (APP-CWEB)', () => {
  test('FLOW-CUS-005: cancel a reservation → cancelled + refund + history', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await signInCustomer(page);
    const ref = await bookViaUi(page, 40); // far out → free cancellation

    await page.goto('/trips');
    await page.getByTestId(`trip-manage-${ref}`).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${ref}$`));
    await expect(page.getByTestId('res-state')).toContainText('confirmed');
    await shot(page, testInfo, 'cweb-reservation-detail');

    await page.getByTestId('res-cancel').click();
    const cancelDialog = page.getByRole('dialog');
    const cancelConfirm = cancelDialog.getByRole('button', { name: 'Cancel reservation' });
    await expect(cancelConfirm).toBeDisabled(); // a reason is required
    await cancelDialog
      .getByLabel(/Why are you cancelling/i)
      .selectOption({ label: 'Plans changed' });
    await cancelConfirm.click();

    await expect(page.getByTestId('res-state')).toContainText('cancelled');
    await expect(page.getByTestId('res-refunded')).toBeVisible();
    await expect(page.getByTestId('res-history')).toContainText(/cancelled/i);
    await shot(page, testInfo, 'cweb-reservation-cancelled');

    guards.assertClean();
  });

  test('FLOW-CUS-004: change the return date → delta charged, total updated, history', async ({
    page,
  }) => {
    const guards = attachConsoleGuards(page);
    await signInCustomer(page);
    const ref = await bookViaUi(page, 55, 3);

    await page.goto(`/trips/${ref}`);
    const before = await page.getByTestId('res-total').innerText();

    await page.getByTestId('res-new-return').fill(localDateTime(55 + 5, 11)); // 5 days instead of 3
    await page.getByTestId('res-modify').click();

    await expect(page.getByTestId('res-modify-msg')).toContainText(/charged/i);
    await expect(page.getByTestId('res-total')).not.toHaveText(before);
    await expect(page.getByTestId('res-history')).toContainText(/modified/i);

    guards.assertClean();
  });
});

test.describe('operations reservation queue (APP-OPS)', () => {
  test('SCREEN-OPS-004: the reservation queue renders and filters', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    await page.goto('/ops/reservations');
    await expect(page.getByRole('heading', { name: 'Reservations' })).toBeVisible();
    await expect(page.getByTestId('ops-res-table')).toBeVisible();
    await page.getByTestId('ops-queue-tab-all').click();
    await expect(page).toHaveURL(/view=all/);
    await expect(page.getByTestId('ops-res-rows')).toBeVisible();
    await shot(page, testInfo, 'ops-reservation-queue');
    guards.assertClean();
  });
});
