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
