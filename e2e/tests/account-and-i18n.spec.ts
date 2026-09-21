import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-001 remaining screens:
 *  - SCREEN-CUS-013 saved drivers: add → appears → remove (confirm).
 *  - SCREEN-CUS-024 data requests: closure request is accepted and shows its retention blocker;
 *    it can then be cancelled.
 *  - SCREEN-OPS-034 translation catalogue: coverage by language + namespace renders; a string
 *    can be edited and moved to "in review".
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };
const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };

async function signInCustomer(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
  await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe('customer account (APP-CWEB)', () => {
  test('SCREEN-CUS-013: add and remove a saved driver', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await signInCustomer(page);

    await page.goto('/account/drivers');
    await expect(page.getByRole('heading', { level: 1, name: /Saved drivers/ })).toBeVisible();

    const name = `Alex Traveller ${Date.now() % 100000}`;
    await page.getByLabel('Full name', { exact: false }).fill(name);
    await page.getByLabel('Licence number', { exact: false }).fill('D1234567');
    await page.getByTestId('driver-add-submit').click();

    const row = page.getByTestId('driver-list').getByText(name);
    await expect(row).toBeVisible();
    await shot(page, testInfo, 'cweb-drivers');

    // remove via confirm dialog
    await page
      .getByTestId('driver-list')
      .locator('li', { hasText: name })
      .getByRole('button', { name: 'Remove' })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('driver-list').getByText(name)).toHaveCount(0);

    guards.assertClean();
  });

  test('SCREEN-CUS-024: a closure request with nothing open is received with a reply date, and can be withdrawn', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await signInCustomer(page);

    await page.goto('/account/data');
    await expect(page.getByRole('heading', { name: /Data requests/ })).toBeVisible();

    await page.locator('#data-kind-closure').check();
    await page.getByTestId('data-request-submit').click();

    // DEC-041: a closure is blocked only by what is really open (a current or upcoming reservation
    // or rental, an unresolved payment issue) — the dev customer has none, so it is simply received,
    // with the day a reply is due. (It used to be "blocked" by a placeholder retention line, always.)
    const item = page.getByTestId('data-request-closure').first();
    await expect(item).toBeVisible();
    await expect(item).toContainText(/received/i);
    await expect(item.getByTestId('data-request-due')).toBeVisible();
    await expect(item.getByTestId('data-request-blockers')).toHaveCount(0);
    await shot(page, testInfo, 'cweb-data-requests');

    // clean up so reruns against the shared dev DB stay tidy
    await item.getByTestId('data-request-cancel-closure').click();
    await expect(page.getByTestId('data-request-closure').first()).toContainText(/cancelled/i);

    guards.assertClean();
  });
});

test.describe('operations translations (APP-OPS)', () => {
  test('SCREEN-OPS-034: coverage renders and a string can be marked for review', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    await page.goto('/ops/website/translations');
    await expect(page.getByRole('heading', { name: /Translation catalogue/ })).toBeVisible();

    const coverage = page.getByTestId('translation-coverage');
    await expect(coverage).toBeVisible();
    await expect(coverage.locator('tr[data-row$=":fr"]').first()).toBeVisible();
    await expect(coverage.locator('tr[data-row$=":ar"]').first()).toBeVisible();

    // edit the first key and move it to review
    const firstEntry = page.getByTestId('translation-entries').locator('li[data-key]').first();
    const key = await firstEntry.getAttribute('data-key');
    await firstEntry.getByRole('textbox').fill(`E2E review ${Date.now() % 100000}`);
    await firstEntry.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(page.getByTestId(`translation-status-${key}`)).toContainText(/review/i);

    await shot(page, testInfo, 'ops-translations');
    guards.assertClean();
  });
});
