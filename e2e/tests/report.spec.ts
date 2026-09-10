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

  // draft a cancellation-policy change
  await page.getByTestId('config-key').selectOption('cancellation');
  await page.getByLabel('Free-cancel window (hours)', { exact: false }).fill('36');
  await page.getByLabel('Late-cancel fee (basis points)', { exact: false }).fill('2500');

  await page.getByTestId('config-preview').click();
  await expect(page.getByTestId('config-preview-output')).toContainText('36h');
  await shot(page, testInfo, 'ops-config-preview');

  await page.getByTestId('config-draft').click();
  const draftRow = page
    .getByTestId('config-version-rows')
    .locator('tr[data-state="draft"]')
    .first();
  await expect(draftRow).toBeVisible();
  const rev = (await draftRow.getAttribute('data-rev'))!;
  const row = page.getByTestId(`config-row-${rev}`);

  await row.getByRole('button', { name: 'Submit' }).click();
  await expect(row).toHaveAttribute('data-state', 'in_review');
  await shot(page, testInfo, 'ops-config-in-review');

  // publishing is a different person — switch to a second admin who holds config.publish
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForURL(/\/ops\/sign-in/);
  await signInStaff(page, MANAGER);
  await page.goto('/ops/config');

  const row2 = page.getByTestId(`config-row-${rev}`);
  await row2.getByRole('button', { name: /Approve & publish/ }).click();
  // approving publishes live — confirm first
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Approve & publish/ })
    .click();
  await expect(row2).toHaveAttribute('data-state', 'published');
  await shot(page, testInfo, 'ops-config-published');

  guards.assertClean();
});

test('SCREEN-OPS-035: run a report, see the scope, export CSV', async ({ page }, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/insights');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

  await page.getByTestId('report-select').selectOption('fleet_utilisation');
  await page.getByTestId('report-run').click();

  await expect(page.getByTestId('report-result')).toBeVisible();
  await expect(page.getByTestId('report-scope-note')).toContainText(/location/i);
  await expect(page.getByTestId('report-table')).toBeVisible();
  await shot(page, testInfo, 'ops-report-result');

  await page.getByTestId('report-export').click();
  await expect(page.getByTestId('report-csv')).toContainText('state,units');
  await shot(page, testInfo, 'ops-report-csv');

  guards.assertClean();
});

test('SCREEN-OPS-038: the audit viewer filters to the config workflow', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/audit');
  await expect(page.getByRole('heading', { name: 'Audit & activity' })).toBeVisible();

  await page.getByTestId('audit-target').fill('config_version');
  await page.getByTestId('audit-apply').click();

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

  // pick reservation_confirmed · en (seeded with declared vars: reference, total)
  await page.getByTestId('tpl-loc-reservation_confirmed-en').click();
  const body = page.getByTestId('tpl-body');
  await expect(body).toBeVisible();
  // keep {{reference}} (already declared); introduce {{terms}} as a new placeholder
  await body.fill('Booking {{reference}} is confirmed. Terms: {{terms}}');
  // {{terms}} is not declared yet → the editor flags it and blocks save
  await expect(page.getByTestId('tpl-undeclared')).toContainText('terms');
  await page.getByRole('button', { name: 'Add variable' }).click();
  await page.getByTestId('tpl-var-name').last().fill('terms');
  await expect(page.getByTestId('tpl-undeclared')).toHaveCount(0);

  await page.getByRole('button', { name: 'Save draft' }).click();
  // the draft is persisted once Submit-for-review appears (needs a saved draft row)
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible();

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('tpl-preview')).toContainText('RES-SAMPLE1');

  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByTestId('tpl-publish')).toBeVisible();
  await page.getByTestId('tpl-publish').click();
  // publishing a live customer-facing template is confirmed first
  const publishDialog = page.getByRole('dialog');
  await expect(publishDialog).toContainText('Publish this template?');
  await publishDialog.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Status: Published · version 1\.1/)).toBeVisible();
  await shot(page, testInfo, 'ops-templates-published');

  // FR-ADM-011 event-rules half — the delivery rule for this event is editable below
  const rule = page.getByTestId('rule-card');
  await expect(rule).toBeVisible();
  await expect(rule.getByTestId('rule-enabled')).toContainText('on');
  await rule.getByTestId('rule-sender').fill('bookings');
  await rule.getByTestId('rule-audience').selectOption('account_holder');
  await rule.getByTestId('rule-save').click();
  // re-selecting the template re-loads the saved rule (no longer the default badge)
  await page.getByTestId('tpl-loc-reservation_confirmed-fr').click();
  await page.getByTestId('tpl-loc-reservation_confirmed-en').click();
  await expect(rule.getByTestId('rule-sender')).toHaveValue('bookings');

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

  // create a new extra — the server owns the price
  await page.getByTestId('product-code').fill(code);
  await page.getByTestId('product-name').fill('E2E roof box');
  await page.getByTestId('product-kind').selectOption('extra');
  await page.getByTestId('product-price').fill('13.50');
  await page.getByTestId('product-create').click();

  const row = page.locator(`[data-code="${code}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('E2E roof box');
  await expect(row).toContainText('13.50');
  await expect(row).toHaveAttribute('data-active', 'true');
  await shot(page, testInfo, 'ops-products');

  // deactivate it — it drops out of what a customer can pick
  await page.getByTestId(`product-toggle-${code}`).click();
  await expect(page.locator(`[data-code="${code}"]`)).toHaveAttribute('data-active', 'false');

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
  await page.getByTestId('ops-search-go').click();
  await expect(page.getByTestId('ops-search-count')).toContainText('0');
  await shot(page, testInfo, 'ops-search');

  // the kind filter is offered
  await page.getByTestId('ops-search-kind').selectOption('rental');
  await page.getByTestId('ops-search-go').click();
  await expect(page.getByTestId('ops-search-count')).toBeVisible();

  guards.assertClean();
});

test('SCREEN-OPS-022 / FR-ADM-002: create → a second manager approves → lift a customer restriction', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  // a manager raises the restriction
  await signInStaff(page, MANAGER);
  await page.goto('/ops/customers');
  await page.getByTestId('cust-search').fill('Demo');
  await page.getByTestId('cust-results').getByRole('button').first().click();
  await expect(page.getByTestId('cust-record')).toBeVisible();

  const card = page.getByTestId('cust-restrictions');
  await card.getByTestId('rstr-category').selectOption('block');
  await card.getByTestId('rstr-scope').fill('all');
  await card.getByTestId('rstr-create').click();
  await expect(card).toContainText('pending review');
  // the author cannot approve their own
  await expect(card.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await shot(page, testInfo, 'ops-customer-restriction');

  // a different admin approves, then lifts
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForURL(/\/ops\/sign-in/);
  await signInStaff(page, ADMIN);
  await page.goto('/ops/customers');
  await page.getByTestId('cust-search').fill('Demo');
  await page.getByTestId('cust-results').getByRole('button').first().click();
  const card2 = page.getByTestId('cust-restrictions');
  await card2.getByRole('button', { name: 'Approve' }).first().click();
  await expect(card2).toContainText('active');
  await card2.getByRole('button', { name: 'Lift' }).first().click();
  await expect(card2).toContainText('lifted');

  // FR-ADM-001 — the duplicate-handling card offers a reversible merge to a manager
  const mergeCard = page.getByTestId('cust-merge');
  await expect(mergeCard).toBeVisible();
  await expect(mergeCard.getByTestId('cust-merge-into')).toBeVisible();
  await expect(mergeCard.getByTestId('cust-merge-go')).toBeDisabled(); // no target id yet

  guards.assertClean();
});

test('SCREEN-OPS-028 / FR-ADM-007: edit a location’s hours + add a closure exception', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  await signInStaff(page, ADMIN);
  await page.goto('/ops/config/locations');
  await expect(page.getByRole('heading', { level: 1, name: 'Locations' })).toBeVisible();

  // the seeded locations are listed; open JFK
  await page.getByTestId('loc-item-JFK').click();
  await expect(page.getByTestId('loc-name')).toHaveValue(/JFK/);

  // toggle after-hours + save (server accepts, no error banner)
  await page.getByTestId('loc-afterhours').click();
  await page.getByTestId('loc-save').click();
  await expect(page.getByTestId('loc-save-error')).toHaveCount(0);
  await shot(page, testInfo, 'ops-locations');

  // add a holiday closure, see it, remove it
  await page.getByTestId('loc-ex-date').fill('2026-12-25');
  await page.getByTestId('loc-ex-add').click();
  await expect(page.getByTestId('loc-exceptions')).toContainText('2026-12-25');
  await page.getByTestId('loc-exceptions').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByTestId('loc-exceptions')).not.toContainText('2026-12-25');

  guards.assertClean();
});
