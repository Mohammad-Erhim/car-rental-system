import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-006 — Administration & reporting (SCREEN-OPS-033/034/035/038).
 *  - an admin drafts a policy change, previews its effect, submits it; a *different* admin
 *    approves & publishes it — the revision history then shows the published row (FR-ADM-006).
 *  - an admin runs a report, sees the scope it used, and exports the result as CSV.
 *  - the audit viewer filters to the config workflow just performed.
 * Browser timezone is America/New_York (playwright config).
 */

const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };
const MANAGER = { email: 'manager@example.test', password: 'DevPassw0rd!' };

async function signInStaff(page: Page, who: { email: string; password: string }) {
  await page.goto('/ops/sign-in');
  await page.getByLabel('Staff email', { exact: false }).fill(who.email);
  await page.getByLabel('Password', { exact: false }).fill(who.password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  // a fresh sign-in lands on /ops; a sign-in with a stashed return-to lands back there —
  // either way we must leave the sign-in page.
  await page.waitForURL((u) => /\/ops(\/|$)/.test(u.pathname) && !u.pathname.endsWith('/sign-in'));
}

test('SCREEN-OPS-033/034: draft → preview → submit → a second admin approves & publishes', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/config');
  await expect(page.getByRole('heading', { name: 'Configuration versioning' })).toBeVisible();

  // draft a cancellation-policy change in the side sheet
  await page.getByTestId('config-key-cancellation').click();
  await page.getByTestId('config-new').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByTestId('cfg-freeCancelHours').fill('36');
  await sheet.getByTestId('cfg-lateFeeBps').fill('2500');

  await sheet.getByTestId('config-preview').click();
  await expect(sheet.getByTestId('config-preview-output')).toContainText(/36 h/);
  await shot(page, testInfo, 'ops-config-preview');

  await sheet.getByRole('button', { name: 'Save draft' }).click();
  const history = page.getByTestId('config-history');
  const draftRow = history.locator('li').filter({ hasText: 'Draft' }).first();
  await expect(draftRow).toBeVisible();
  const rev = ((await draftRow.textContent()) ?? '').match(/Rev (\d+)/)![1]!;
  const row = history
    .locator('li')
    .filter({ hasText: `Rev ${rev}` })
    .first();

  await row.getByRole('button', { name: 'Submit for review' }).click();
  await expect(row).toContainText('In review');
  await shot(page, testInfo, 'ops-config-in-review');

  // publishing is a different person — switch to a second admin who holds config.publish
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForURL(/\/ops\/sign-in/);
  await signInStaff(page, MANAGER);
  await page.goto('/ops/config');

  const row2 = page
    .getByTestId('config-history')
    .locator('li')
    .filter({ hasText: `Rev ${rev}` })
    .first();
  await row2.getByRole('button', { name: /Approve & publish/ }).click();
  // approving publishes live — confirm first
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Approve & publish/ })
    .click();
  await expect(row2).toContainText('Published');
  await shot(page, testInfo, 'ops-config-published');

  guards.assertClean();
});

test('SCREEN-OPS-035: run a report, see the scope, export CSV', async ({ page }, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/insights');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

  await page.getByTestId('report-select').click();
  await page.getByRole('option', { name: /utili[sz]ation/i }).click();
  await page.getByTestId('report-run').click();

  await expect(page.getByTestId('report-result')).toBeVisible();
  await expect(page.getByTestId('report-scope-note')).toContainText(/location/i);
  await expect(page.getByTestId('report-result').locator('table')).toBeVisible();
  await shot(page, testInfo, 'ops-report-result');

  // the export is a file download now
  const download = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  expect((await download).suggestedFilename()).toMatch(/^report-.*\.csv$/);

  guards.assertClean();
});

test('SCREEN-OPS-038: the audit viewer filters to the config workflow', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/audit');
  await expect(page.getByRole('heading', { name: 'Audit & activity' })).toBeVisible();

  await page.getByTestId('audit-filters').click();
  await page.getByRole('dialog').getByLabel('Target type').fill('config_version');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByTestId('audit-rows')).toContainText('config.version.approved');
  await expect(page.getByTestId('audit-rows')).toContainText('config.version.drafted');
  await shot(page, testInfo, 'ops-audit-log');

  guards.assertClean();
});

test('SCREEN-OPS-033 / FR-ADM-011: edit → preview → submit → publish a notification template', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/config/templates');
  await expect(page.getByRole('heading', { name: 'Notification templates' })).toBeVisible();

  // open reservation_confirmed · en (seeded with declared vars: reference, total)
  await page.goto('/ops/config/templates/reservation_confirmed/email?locale=en');
  await page.getByTestId('tpl-edit').click();
  const sheet = page.getByRole('dialog');
  const body = sheet.getByTestId('tpl-body');
  await expect(body).toBeVisible();
  // keep {{reference}} (already declared); introduce {{terms}} as a new placeholder
  await body.fill('Booking {{reference}} is confirmed. Terms: {{terms}}');
  // {{terms}} is not declared yet → the sheet flags it and blocks the save
  await expect(sheet.getByTestId('tpl-undeclared')).toContainText('terms');
  await sheet.getByTestId('tpl-add-var').click();
  await sheet.getByTestId('tpl-var-name').last().fill('terms');
  await expect(sheet.getByTestId('tpl-undeclared')).toHaveCount(0);

  await sheet.getByRole('button', { name: 'Save draft' }).click();
  // the draft is persisted once Submit-for-review appears (needs a saved draft row)
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible();

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('tpl-preview')).toContainText('RES-SAMPLE1');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByTestId('tpl-publish')).toBeVisible();
  await page.getByTestId('tpl-publish').click();
  // publishing a live customer-facing template is confirmed first
  const publishDialog = page.getByRole('dialog');
  await expect(publishDialog).toContainText('Publish this template?');
  await publishDialog.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  await shot(page, testInfo, 'ops-templates-published');

  // FR-ADM-011 event-rules half — the delivery rule for this event is edited in its own sheet
  const rule = page.getByTestId('rule-card');
  await expect(rule).toBeVisible();
  await expect(rule.getByTestId('rule-enabled')).toContainText('on');
  await rule.getByTestId('rule-edit').click();
  const ruleSheet = page.getByRole('dialog');
  await ruleSheet.getByTestId('rule-sender').fill('bookings');
  await ruleSheet.getByTestId('rule-audience').click();
  await page.getByRole('option', { name: 'Account holder' }).click();
  await ruleSheet.getByRole('button', { name: 'Save delivery rule' }).click();
  // the saved rule shows on the page (no longer the default)
  await expect(rule).toContainText('bookings');
  await expect(rule).toContainText('Account holder');

  guards.assertClean();
});

test('SCREEN-OPS-021/022 / FR-ADM-001: search a customer and open the consolidated record', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/customers');
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();

  await page.getByTestId('cust-search').fill('Demo');
  await expect(page.getByTestId('cust-results')).toBeVisible();
  await page.getByTestId('cust-results').getByRole('button').first().click();

  const record = page.getByTestId('cust-record');
  await expect(record).toBeVisible();
  await expect(record).toContainText('Demo Customer');
  // consolidated sections render
  await expect(page.getByText(/Reservations \(/)).toBeVisible();
  await expect(page.getByText(/Saved drivers \(/)).toBeVisible();
  await shot(page, testInfo, 'ops-customer-record');

  guards.assertClean();
});

test('SCREEN-OPS-027 / FR-ADM-006: add an extra to the catalogue, then deactivate it', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);
  const code = `e2e_addon_${Date.now().toString(36)}`;

  await signInStaff(page, ADMIN);
  await page.goto('/ops/catalogue/products');
  await expect(page.getByRole('heading', { name: 'Extras & protection' })).toBeVisible();

  // the seeded catalogue is listed
  await expect(page.getByTestId('products-rows')).toContainText('GPS navigation');

  // create a new extra in the side sheet — the server owns the price
  await page.getByTestId('product-new').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByTestId('product-code').fill(code);
  await sheet.getByTestId('product-name').fill('E2E roof box');
  await sheet.getByTestId('product-price').fill('13.50');
  await sheet.getByRole('button', { name: 'Save product' }).click();

  const row = page.getByTestId('products-rows').locator('tr').filter({ hasText: code });
  await expect(row).toBeVisible();
  await expect(row).toContainText('E2E roof box');
  await expect(row).toContainText('13.50');
  await shot(page, testInfo, 'ops-products');

  // edit it: the code is read-only, and the pricing unit can change
  await row.locator('td').first().click();
  const edit = page.getByRole('dialog');
  await expect(edit.locator('input[data-testid="product-code"]')).toHaveCount(0); // code is locked
  await edit.getByTestId('product-pricing-unit').click();
  await page.getByRole('option', { name: 'Per day' }).click();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(row).toContainText(/per day/i);

  // deactivate it — it drops out of what a customer can pick (confirmed first)
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Deactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(row).toContainText('Inactive');

  guards.assertClean();
});

test('SCREEN-OPS-004 / FR-ADM-003: the unified search runs across reservations + rentals', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/search');
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();

  // a query with no matches renders the empty state cleanly (no console errors)
  await page.getByTestId('ops-search-q').fill('RES-NO-SUCH-REF');
  await expect(page.getByTestId('ops-search-results')).toContainText('No matches');
  await shot(page, testInfo, 'ops-search');

  // the kind tabs narrow the search, and the choice is kept in the URL
  await page.getByTestId('ops-search-kind-rental').click();
  await expect(page).toHaveURL(/kind=rental/);
  await expect(page.getByTestId('ops-search-results')).toBeVisible();

  guards.assertClean();
});

test('SCREEN-OPS-022 / FR-ADM-002: create → a second manager approves → lift a customer restriction', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  const openDemoCustomer = async () => {
    await page.goto('/ops/customers');
    await page.getByTestId('cust-search').fill('Demo');
    await page.getByRole('row').filter({ hasText: /Demo/ }).first().click();
    await expect(page.getByTestId('cust-record')).toBeVisible();
  };

  // a manager raises the restriction (defaults: block, all bookings — a reason is required)
  await signInStaff(page, MANAGER);
  await openDemoCustomer();
  await page.getByTestId('rstr-add').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add restriction' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); // reason missing
  await dialog.getByRole('combobox').last().click();
  await page.getByRole('option', { name: 'Suspected fraud' }).click();
  await dialog.getByRole('button', { name: 'Add restriction' }).click();
  const card = page.getByTestId('cust-restrictions');
  await expect(card).toContainText('pending review');
  // the author cannot approve their own
  await expect(card.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await shot(page, testInfo, 'ops-customer-restriction');

  // a different admin approves (through the dialog), then lifts
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForURL(/\/ops\/sign-in/);
  await signInStaff(page, ADMIN);
  await openDemoCustomer();
  const card2 = page.getByTestId('cust-restrictions');
  await card2.getByRole('button', { name: 'Approve' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(card2).toContainText('active');
  await card2.getByRole('button', { name: 'Lift' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lift' }).click();
  await expect(card2).toContainText('lifted');

  // FR-ADM-001 — the reversible duplicate merge is offered to a manager, and needs a survivor
  await page.getByTestId('cust-more').click();
  await page.getByTestId('cust-merge-open').click();
  const mergeDialog = page.getByRole('dialog');
  await expect(mergeDialog.getByTestId('cust-merge-into')).toBeVisible();
  await mergeDialog.getByRole('button', { name: 'Merge into this record' }).click();
  await expect(mergeDialog.getByRole('alert')).toContainText('Choose the record to keep');

  guards.assertClean();
});

test('SCREEN-OPS-028 / FR-ADM-007: edit a location’s hours + add a closure exception', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/config/locations');
  await expect(page.getByRole('heading', { level: 1, name: 'Locations' })).toBeVisible();

  // the seeded locations are listed; open JFK on its own page
  await page
    .getByTestId('locations-rows')
    .locator('tr')
    .filter({ hasText: 'JFK' })
    .locator('a')
    .first()
    .click();
  await expect(page.getByTestId('loc-record')).toContainText('JFK');

  // toggle after-hours in the edit sheet + save (server accepts, sheet closes)
  await page.getByTestId('loc-edit').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByTestId('loc-afterhours').click();
  await sheet.getByRole('button', { name: 'Save location' }).click();
  await expect(sheet).toHaveCount(0);
  await shot(page, testInfo, 'ops-locations');

  // add a holiday closure, see it, remove it
  await page.getByTestId('loc-ex-new').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('loc-ex-date').fill('2026-12-25');
  await dialog.getByRole('button', { name: 'Add closure' }).click();
  await expect(page.getByTestId('loc-exceptions')).toContainText('Dec 25, 2026');
  await page.getByTestId('loc-exceptions').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByTestId('loc-exceptions')).toHaveCount(0);

  guards.assertClean();
});
