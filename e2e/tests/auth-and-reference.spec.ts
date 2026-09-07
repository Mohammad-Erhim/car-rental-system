import { expect, test } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-001 E2E:
 *  - FLOW-CUS-002: an anonymous visitor opening a protected page is sent to sign-in with the
 *    return target preserved, and lands back there after signing in.
 *  - SCREEN-CUS-008 sign-in + SCREEN-CUS-012 profile (locale change kept).
 *  - SCREEN-OPS-001 staff sign-in + SCREEN-OPS-030/031: edit a cancel-reason label as admin →
 *    the customer-facing selector for that lookup reflects it (propagation, no redeploy).
 *  - Permission gate: an agent cannot open Staff & roles.
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };
const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };
const AGENT = { email: 'agent@example.test', password: 'DevPassw0rd!' };

test.describe('customer auth (APP-CWEB)', () => {
  test('FLOW-CUS-002: protected route → sign-in with return-to → back to origin', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/account/profile');
    await expect(page).toHaveURL(/\/sign-in$/);
    await shot(page, testInfo, 'cweb-signin');

    await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    // returned to the originally requested page
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByRole('heading', { name: /Profile/ })).toBeVisible();
    await shot(page, testInfo, 'cweb-profile');
    guards.assertClean();
  });

  test('SCREEN-CUS-012: changing language persists and re-renders the app in that locale', async ({
    page,
  }) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/account$/);

    const save = () => page.getByRole('button', { name: /^(Save|Enregistrer)$/ }).click();

    // Self-contained: normalise to English first (the demo customer is shared dev state),
    // then prove that *changing* the language re-renders the running app, then restore.
    await page.goto('/account/profile');
    await page.locator('#field-locale').selectOption('en');
    await save();
    await expect(page.getByRole('link', { name: /^My trips$/ })).toBeVisible();

    // change → the app chrome re-renders into French without a reload (SRS-I18N-009)
    await page.locator('#field-locale').selectOption('fr');
    await save();
    await expect(page.getByRole('link', { name: /^Mes trajets$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Enregistrer$/ })).toBeVisible();

    // the choice survives a full reload (persisted on the account, applied on session restore)
    await page.reload();
    await expect(page.getByRole('link', { name: /^Mes trajets$/ })).toBeVisible();

    // restore baseline for other specs / reruns against the shared dev DB
    await page.locator('#field-locale').selectOption('en');
    await save();
    await expect(page.getByRole('link', { name: /^My trips$/ })).toBeVisible();

    guards.assertClean();
  });
});

test.describe('operations foundation (APP-OPS)', () => {
  test('SCREEN-OPS-001 + SCREEN-OPS-031: admin edits a lookup label → customer selector reflects it', async ({
    page,
    request,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    // staff sign in
    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);
    await shot(page, testInfo, 'ops-dashboard-authed');

    // open reference data → cancel_reason
    await page.getByRole('link', { name: 'Reference data' }).first().click();
    await expect(page).toHaveURL(/reference-data$/);
    await page.getByTestId('lookup-type-cancel_reason').click();

    const row = page.locator('[data-testid="lookup-value-rows"] tr[data-code="other"]');
    await expect(row).toBeVisible();
    const newLabel = `Other reason ${Date.now() % 100000}`;
    // the inline-edit trigger is a button showing the current label
    await row.locator('button').first().click();
    await row.getByLabel('Edit label').fill(newLabel);
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row).toContainText(newLabel);

    await shot(page, testInfo, 'ops-reference-data');

    // the public selector API for that lookup now returns the new label (no redeploy)
    const res = await request.get(
      'http://localhost:3001/api/v1/reference-data/types/cancel_reason/values?locale=en',
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const other = body.values.find((v: { code: string }) => v.code === 'other');
    expect(other.label).toBe(newLabel);

    guards.assertClean();
  });

  test('permission gate: an agent cannot open Staff & roles', async ({ page }) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(AGENT.email);
    await page.getByLabel('Password', { exact: false }).fill(AGENT.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    // no "Staff & roles" nav item for an agent
    await expect(page.getByRole('link', { name: 'Staff & roles' })).toHaveCount(0);

    // direct navigation → permission-denied state, no data leak
    await page.goto('/ops/admin/staff');
    await expect(page.locator('[data-appstate="permission-denied"]')).toBeVisible();
    await expect(page.getByTestId('staff-table')).toHaveCount(0);
    guards.assertClean();
  });
});
