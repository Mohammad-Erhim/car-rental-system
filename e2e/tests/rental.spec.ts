import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-005 — rental lifecycle (FLOW-OPS-002/005/006).
 * An agent assigns a vehicle to a confirmed booking, runs pickup (agreement + odo/fuel), the
 * customer extends the rental, then the agent runs return (fuel deficit → settlement) and marks
 * the vehicle ready for hire. Browser timezone is America/New_York (playwright config).
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };
const AGENT = { email: 'agent@example.test', password: 'DevPassw0rd!' };

function localDateTime(daysAhead: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function signIn(page: Page, who: 'customer' | 'staff') {
  const url = who === 'staff' ? '/ops/sign-in' : '/sign-in';
  const creds = who === 'staff' ? AGENT : CUSTOMER;
  await page.goto(url);
  await page
    .getByLabel(who === 'staff' ? 'Staff email' : 'Email', { exact: false })
    .fill(creds.email);
  await page.getByLabel('Password', { exact: false }).fill(creds.password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).toHaveURL(who === 'staff' ? /\/ops$/ : /\/account$/);
}

async function bookViaUi(page: Page): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // let the client search island hydrate
  const loc = page.getByTestId('search-location');
  await loc.selectOption('JFK');
  await expect(loc).toHaveValue('JFK');
  await page.getByTestId('search-pickup-at').fill(localDateTime(20, 11));
  await page.getByTestId('search-return-at').fill(localDateTime(23, 11));
  await page.getByTestId('search-submit').click();
  await expect(page).toHaveURL(/\/search\?/);
  await page
    .getByTestId('result-suv')
    .getByRole('link', { name: /View & reserve/ })
    .click();
  await expect(page).toHaveURL(/\/vehicles\/suv\?/);
  await expect(page.getByTestId('reserve-button')).toBeEnabled();
  await page.getByTestId('reserve-button').click();
  await expect(page).toHaveURL(/\/checkout\?quote=/);
  await page.getByLabel('Primary driver name', { exact: false }).fill('Rex Renter');
  await page.getByLabel('Email for the confirmation', { exact: false }).fill('rex@example.test');
  await page.getByTestId('co-card').selectOption('tok_visa_ok');
  await page.getByTestId('co-terms').check();
  await page.getByTestId('co-pay').click();
  await expect(page.getByTestId('confirm-state')).toContainText('confirmed');
  return page.getByTestId('confirm-ref').innerText();
}

test('FLOW-OPS: assign → pickup → customer extend → return → ready', async ({ page }, testInfo) => {
  const guards = attachConsoleGuards(page);

  // customer books
  await signIn(page, 'customer');
  const resRef = await bookViaUi(page);

  // agent assigns + picks up
  await signIn(page, 'staff');
  await page.goto('/ops/work');
  await page.getByTestId(`assign-${resRef}`).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Assign vehicle' }).click();
  await expect(page.getByText(`Vehicle assigned for ${resRef}.`)).toBeVisible();

  await page.goto('/ops/rentals');
  // scope to the rental for *this* reservation — the shared dev DB may carry other rentals
  const row = page.getByRole('row').filter({ hasText: resRef });
  await expect(row).toBeVisible();
  const rentalRef = (await row.getByRole('link').first().innerText()).trim();
  await row.getByTestId(`pickup-open-${rentalRef}`).click();
  const pickupDialog = page.getByRole('dialog');
  await pickupDialog.getByTestId(`pickup-odo-${rentalRef}`).fill('15000');
  await pickupDialog.getByTestId(`pickup-driver-${rentalRef}`).fill('Rex Renter');
  await pickupDialog.getByTestId(`pickup-licence-${rentalRef}`).fill('D-778899');
  await pickupDialog.getByRole('button', { name: 'Confirm pickup' }).click();
  await expect(page.getByText(`${rentalRef} picked up`)).toBeVisible();
  await page.getByTestId('ops-rent-tab-active').click();
  await expect(page.getByRole('row').filter({ hasText: rentalRef })).toContainText('Active');
  await shot(page, testInfo, 'ops-rental-active');

  // customer extends from the reservation detail
  await signIn(page, 'customer');
  await page.goto(`/trips/${resRef}`);
  await expect(page.getByText(/Your rental is active/)).toBeVisible();
  await page.getByTestId('rental-extend-to').fill(localDateTime(26, 11));
  await page.getByTestId('rental-extend').click();
  await expect(page.getByTestId('rental-extend-msg')).toContainText(/charged/i);
  await shot(page, testInfo, 'cweb-rental-extended');

  // agent returns with a fuel deficit, then marks ready
  await signIn(page, 'staff');
  await page.goto('/ops/rentals?state=active');
  await page.getByTestId(`return-open-${rentalRef}`).click();
  const returnDialog = page.getByRole('dialog');
  await returnDialog.getByTestId(`return-odo-${rentalRef}`).fill('15480');
  await returnDialog.getByTestId(`return-fuel-${rentalRef}`).fill('75');
  // record a damage finding on the return inspection
  await returnDialog.getByTestId(`return-add-finding-${rentalRef}`).click();
  const finding = returnDialog.getByTestId(`return-finding-${rentalRef}-0`);
  await finding.getByLabel(/Area/i).fill('front bumper');
  await finding.getByLabel(/What is damaged/i).fill('deep scratch');
  await finding.getByLabel(/Charge/i).fill('60.00');
  // the dialog spells out the settlement before it is captured
  await expect(returnDialog).toContainText(/deficit|damage/i);
  await returnDialog.getByRole('button', { name: 'Confirm return' }).click();
  await expect(page.getByText(/settlement/i).first()).toBeVisible();
  await page.getByTestId('ops-rent-tab-closed').click();
  await expect(page.getByRole('row').filter({ hasText: rentalRef })).toContainText('Closed');
  await page.getByTestId(`readiness-open-${rentalRef}`).click();
  await shot(page, testInfo, 'ops-rental-returned');
  await page.getByRole('dialog').getByRole('button', { name: 'Pass — return to fleet' }).click();

  guards.assertClean();
});
