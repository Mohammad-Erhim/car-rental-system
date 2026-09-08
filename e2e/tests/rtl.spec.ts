import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-001 RTL set (SRS-I18N-006/009). The auth surface and an operations management screen
 * render correctly right-to-left in Arabic, with no horizontal page overflow.
 */

/** Ops dashboard (apps/web) — a menu-button language switcher. */
const openLanguageMenu = (page: Page) =>
  page
    .getByRole('button', { name: /Current language|Langue actuelle|اللغة الحالية/ })
    .first()
    .click();

/** Customer site (apps/site) — a plain <select> in the header. Wait for hydration first: a
 *  pre-hydration selectOption sets the DOM value but React's onChange (which navigates) never
 *  fires. */
async function setSiteLocale(page: Page, code: string) {
  await page.waitForLoadState('networkidle');
  await page.locator('header select').first().selectOption(code);
}

async function assertNoOverflow(label: string, page: Page) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(o.sw, `${label}: horizontal overflow`).toBeLessThanOrEqual(o.cw + 1);
}

test('RTL: customer auth + operations reference data render right-to-left', async ({
  page,
}, testInfo) => {
  const guards = attachConsoleGuards(page);

  // customer sign-in in Arabic (apps/site — locale is a URL segment set from the header <select>)
  await page.goto('/sign-in');
  await setSiteLocale(page, 'ar');
  await expect(page).toHaveURL(/\/ar\/sign-in/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, testInfo, 'rtl-cweb-signin');
  await assertNoOverflow('RTL customer sign-in', page);

  // operations: sign in as admin, open reference data, switch to Arabic
  await page.goto('/ops/sign-in');
  await page.getByLabel('Staff email', { exact: false }).fill('admin@example.test');
  await page.getByLabel('Password', { exact: false }).fill('DevPassw0rd!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ops$/);

  await page.goto('/ops/config/reference-data');
  await expect(page.getByTestId('lookup-value-rows')).toBeVisible();
  await openLanguageMenu(page);
  await page.getByRole('menuitem', { name: /العربية/ }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('lookup-value-rows')).toBeVisible();
  await shot(page, testInfo, 'rtl-ops-reference-data');
  await assertNoOverflow('RTL ops reference-data', page);

  // STAGE-006: the configuration-versioning editor renders right-to-left with no overflow
  await page.goto('/ops/config');
  await expect(page.getByRole('heading', { name: /Configuration versioning|إعداد/ })).toBeVisible();
  await expect(page.getByTestId('config-draft')).toBeVisible();
  await shot(page, testInfo, 'rtl-ops-config-versioning');
  await assertNoOverflow('RTL ops config-versioning', page);

  guards.assertClean();
});
