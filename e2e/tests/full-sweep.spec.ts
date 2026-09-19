import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-007 — full responsive + locale sweep (SRS §22.5 evidence bundle). Every implemented
 * route is visited at the running project's viewport (phone 390 / tablet 820 / laptop 1440),
 * asserted to have no horizontal page overflow, checked by the console/network guards, and
 * screenshotted. A representative subset is re-checked in Arabic (RTL). Deep interaction is
 * covered by the per-feature specs — this is the breadth pass.
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };
const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };

async function noOverflow(label: string, page: Page) {
  const o = await page.evaluate(() => {
    const el = document.documentElement;
    return { sw: el.scrollWidth, cw: el.clientWidth };
  });
  expect(o.sw, `${label}: horizontal overflow (${o.sw} > ${o.cw})`).toBeLessThanOrEqual(o.cw + 1);
}

async function visit(page: Page, testInfo: TestInfo, path: string, name: string) {
  await page.goto(path);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await noOverflow(`${name} (${path})`, page);
  await shot(page, testInfo, `sweep-${name}`);
}

const CUSTOMER_ROUTES: Array<[string, string]> = [
  ['/', 'home'],
  ['/search', 'search'],
  ['/vehicles/economy', 'vehicle-detail'],
  ['/sign-in', 'signin'],
  ['/register', 'register'],
  ['/recovery', 'recovery'],
  ['/account', 'account'],
  ['/account/profile', 'account-profile'],
  ['/account/drivers', 'account-drivers'],
  ['/account/payments', 'account-payments'],
  ['/account/data', 'account-data'],
  ['/trips', 'trips'],
  ['/help', 'help'],
];

const OPS_ROUTES: Array<[string, string]> = [
  ['/ops', 'ops-dashboard'],
  ['/ops/search', 'ops-search'],
  ['/ops/reservations', 'ops-reservations'],
  ['/ops/rentals', 'ops-rentals'],
  ['/ops/fleet', 'ops-fleet'],
  ['/ops/finance', 'ops-finance'],
  ['/ops/customers', 'ops-customers'],
  ['/ops/catalogue/products', 'ops-products'],
  ['/ops/settings/policies', 'ops-config'],
  ['/ops/catalogue/rate-plans', 'ops-rate-plans'],
  ['/ops/catalogue/locations', 'ops-locations'],
  ['/ops/settings/reference-data', 'ops-reference-data'],
  ['/ops/website/translations', 'ops-translations'],
  ['/ops/website/templates', 'ops-templates'],
  ['/ops/admin/staff', 'ops-staff'],
  ['/ops/reports', 'ops-reports'],
  ['/ops/admin/audit', 'ops-audit'],
];

test.describe('full sweep — responsive', () => {
  test('every customer route renders with no horizontal overflow', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/account$/);

    for (const [path, name] of CUSTOMER_ROUTES) {
      await visit(page, testInfo, path, name);
    }
    guards.assertClean();
  });

  test('every operations route renders with no horizontal overflow', async ({ page }, testInfo) => {
    const guards = attachConsoleGuards(page);
    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    for (const [path, name] of OPS_ROUTES) {
      await visit(page, testInfo, path, name);
    }
    guards.assertClean();
  });
});

test.describe('full sweep — Arabic / RTL', () => {
  test('a representative set renders right-to-left with no overflow', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'RTL sweep on phone + laptop is enough');
    const guards = attachConsoleGuards(page);

    // apps/site — locale is a URL segment; `/[locale]/layout` sets <html lang dir> server-side,
    // so a direct visit to an `/ar/…` path is enough (the switcher itself is covered in rtl.spec).
    for (const [path, name] of [
      ['/ar', 'home'],
      ['/ar/search', 'search'],
      ['/ar/register', 'register'],
      ['/ar/sign-in', 'signin'],
    ] as Array<[string, string]>) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading').first()).toBeVisible();
      await noOverflow(`rtl ${name} (${path})`, page);
      await shot(page, testInfo, `sweep-rtl-${name}`);
    }

    // ops, signed in as admin, in Arabic
    await page.goto('/ops/sign-in');
    await page.getByLabel(/Staff email|بريد/, { exact: false }).fill(ADMIN.email);
    await page.getByLabel(/Password|كلمة/, { exact: false }).fill(ADMIN.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/ops$/);
    for (const [path, name] of [
      ['/ops', 'ops-dashboard'],
      ['/ops/settings/policies', 'ops-config'],
      ['/ops/reports', 'ops-reports'],
      ['/ops/admin/audit', 'ops-audit'],
    ] as Array<[string, string]>) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await noOverflow(`rtl ${name} (${path})`, page);
      await shot(page, testInfo, `sweep-rtl-${name}`);
    }
    guards.assertClean();
  });
});
