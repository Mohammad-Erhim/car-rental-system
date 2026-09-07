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
  await page.getByTestId('search-location').selectOption('JFK');
  await page.getByTestId('search-pickup-at').fill(localDateTime(20, 11));
  await page.getByTestId('search-return-at').fill(localDateTime(23, 11));
  await page.getByTestId('search-submit').click();
  await page
    .getByTestId('result-economy')
    .getByRole('link', { name: /View & reserve/ })
    .click();
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
  await page.getByLabel('Filter by state').selectOption('confirmed');
  await page.getByTestId(`assign-${resRef}`).click();
  await expect(page.getByTestId('assign-msg')).toContainText(/assigned/i);

  await page.goto('/ops/rentals');
  const card = page.getByTestId('rental-list').locator('[data-state="awaiting_pickup"]').first();
  await expect(card).toBeVisible();
  const rentalRef = (await card.getByTestId(/rental-state-/).getAttribute('data-testid'))!.replace(
    'rental-state-',
    '',
  );
  await page.getByTestId(`pickup-open-${rentalRef}`).click();
  await page.getByTestId(`pickup-odo-${rentalRef}`).fill('15000');
  await page.getByTestId(`pickup-driver-${rentalRef}`).fill('Rex Renter');
  await page.getByTestId(`pickup-licence-${rentalRef}`).fill('D-778899');
  await page.getByTestId(`pickup-submit-${rentalRef}`).click();
  await expect(page.getByTestId(`rental-state-${rentalRef}`)).toContainText('active');
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
  await page.goto('/ops/rentals');
  await page.getByTestId(`return-open-${rentalRef}`).click();
  await page.getByTestId(`return-odo-${rentalRef}`).fill('15480');
  await page.getByTestId(`return-fuel-${rentalRef}`).fill('75');
  await page.getByTestId(`return-submit-${rentalRef}`).click();
  await expect(page.getByTestId(`rental-msg-${rentalRef}`)).toContainText(/settlement/i);
  await expect(page.getByTestId(`rental-state-${rentalRef}`)).toContainText('closed');
  await page.getByTestId(`readiness-${rentalRef}`).click();
  await shot(page, testInfo, 'ops-rental-returned');

  guards.assertClean();
});
