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

  test('S7-DEF-005: a persisted refresh cookie restores the session after the browser is reopened / in a new tab', async ({
    page,
    browser,
  }) => {
    // Sign in, then simulate "closed the browser and came back": a fresh context seeded with
    // storageState carries the persistent cookie + localStorage, but NOT sessionStorage. The
    // session must still restore (the restore hint must live in localStorage, not sessionStorage).
    await page.goto('/account');
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/account$/);

    const state = await page.context().storageState();
    expect(state.cookies.some((c) => c.name === 'carrental_rt_customer')).toBe(true);

    const reopened = await browser.newContext({ storageState: state });
    try {
      const p2 = await reopened.newPage();
      const guards = attachConsoleGuards(p2);
      await p2.goto('/account');
      // stays on /account (silent refresh), never bounces to /sign-in
      await expect(p2).toHaveURL(/\/account$/);
      await expect(p2.getByRole('heading', { name: /^Account$/ })).toBeVisible();
      guards.assertClean();
    } finally {
      await reopened.close();
    }
  });

  test('S7-OPT-002: signing out in one tab logs the other tab out too', async ({ context }) => {
    // two pages in ONE context = one origin storage, so `storage` events fire between them
    const a = await context.newPage();
    await a.goto('/account');
    await a.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
    await a.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
    await a.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(a).toHaveURL(/\/account$/);

    const b = await context.newPage();
    await b.goto('/account');
    await expect(b).toHaveURL(/\/account$/); // tab B is authenticated

    await a.getByRole('button', { name: /Sign out/ }).click();
    // tab B reacts to the storage event and drops to an anonymous state
    await b.goto('/account');
    await expect(b).toHaveURL(/\/sign-in$/);

    await a.close();
    await b.close();
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

    const localeField = page.locator('#field-locale');
    const saveBtn = page.getByRole('button', { name: /^(Save|Enregistrer)$/ });
    // set the language select and persist it. The profile form repopulates from its own fetch
    // after every save, which can race a `selectOption` and a save-in-flight, so: retry the
    // select until the value sticks, submit, and wait for the mutation to settle before the
    // caller asserts the re-rendered chrome.
    const setLocale = async (code: string) => {
      await expect(localeField).toBeEnabled();
      await expect(async () => {
        await localeField.selectOption(code);
        await expect(localeField).toHaveValue(code);
      }).toPass({ timeout: 10_000 });
      await saveBtn.click();
      await expect(saveBtn).toBeEnabled(); // loading spinner cleared → save round-trip done
      await expect(localeField).toHaveValue(code); // survived the post-save repopulate
    };

    // Self-contained: normalise to English first (the demo customer is shared dev state),
    // then prove that *changing* the language re-renders the running app, then restore.
    await page.goto('/account/profile');
    await page.waitForLoadState('networkidle');
    await setLocale('en');
    await expect(page.getByRole('link', { name: /^My trips$/ })).toBeVisible();

    // change → the app chrome re-renders into French without a reload (SRS-I18N-009)
    await setLocale('fr');
    await expect(page.getByRole('link', { name: /^Mes trajets$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Enregistrer$/ })).toBeVisible();

    // the choice survives a full reload (persisted on the account, applied on session restore)
    await page.reload();
    await expect(page.getByRole('link', { name: /^Mes trajets$/ })).toBeVisible();

    // restore baseline for other specs / reruns against the shared dev DB
    await setLocale('en');
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

    const rowsLocator = page.locator('[data-testid="lookup-value-rows"] tr');
    const row = rowsLocator.filter({ has: page.getByText('other', { exact: true }) });
    await expect(row).toBeVisible();
    const newLabel = `Other reason ${Date.now() % 100000}`;
    // edit opens a side panel with a label field per active locale
    await page.getByTestId('menu-other').click();
    await page.getByTestId('edit-other').click();
    const editor = page.getByRole('dialog');
    await editor.getByTestId('label-en').fill(newLabel);
    await editor.getByRole('button', { name: /^Save$/ }).click();
    await expect(editor).toBeHidden();
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

    // reorder: move the first value down, the list order changes and persists
    const codes = () =>
      rowsLocator.evaluateAll((trs) =>
        trs.map((el) => el.querySelector('td:nth-child(2)')?.textContent),
      );
    const rowsBefore = await codes();
    await rowsLocator.first().getByLabel('Move down').click();
    await expect.poll(codes).not.toEqual(rowsBefore);

    // FR-ADM-008 usage check: deactivating a value opens a confirm that reports "where used"
    // (this configurable value has no references in the seed → the plain body shows, no crash)
    await page.getByTestId('menu-other').click();
    await page.getByTestId('deactivate-other').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/new selections|used by/i);
    await dialog.getByRole('button', { name: /^Cancel$/ }).click();

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
