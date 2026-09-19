import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-001 responsive guard (design §2.4 — usable on phone / tablet / laptop).
 * Runs on all three Playwright projects (phone 390, tablet 820, laptop 1440).
 * The page body must never scroll horizontally, and the expected navigation pattern
 * for the breakpoint must be present.
 */

const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };

async function expectNoHorizontalScroll(pageTitle: string, page: Page) {
  const overflow = await page.evaluate(() => {
    const docEl = document.documentElement;
    const limit = docEl.clientWidth;
    const offenders: string[] = [];
    if (docEl.scrollWidth > limit + 1) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const r = el.getBoundingClientRect();
        if (r.right > limit + 1 && r.width > 0 && r.width <= limit + 400) {
          const cls = typeof el.className === 'string' ? el.className : '';
          offenders.push(
            `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/).slice(0, 3).join('.') : ''} (right=${Math.round(r.right)}, w=${Math.round(r.width)})`,
          );
          if (offenders.length >= 6) break;
        }
      }
    }
    return { scrollWidth: docEl.scrollWidth, clientWidth: limit, offenders };
  });
  expect(
    overflow.scrollWidth,
    `${pageTitle}: horizontal overflow (scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})\noffenders:\n  ${overflow.offenders.join('\n  ')}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe('responsive layout (APP-CWEB / APP-OPS)', () => {
  test('customer surfaces have no horizontal overflow at this viewport', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);
    const isPhoneOrTablet = testInfo.project.name !== 'laptop';

    for (const path of ['/', '/sign-in', '/register', '/recovery']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expectNoHorizontalScroll(`customer ${path}`, page);
    }

    // nav pattern: bottom nav on phone+tablet, header nav on laptop
    await page.goto('/');
    const bottomNav = page.getByTestId('mobile-bottom-nav');
    if (isPhoneOrTablet) {
      await expect(bottomNav).toBeVisible();
      await expect(bottomNav.getByRole('link', { name: /My trips/ })).toBeVisible();
    } else {
      await expect(bottomNav).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
    }

    await shot(page, testInfo, 'responsive-cweb-home');
    guards.assertClean();
  });

  test('operations surfaces have no horizontal overflow at this viewport', async ({
    page,
  }, testInfo) => {
    const guards = attachConsoleGuards(page);

    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    for (const path of [
      '/ops/settings/policies',
      '/ops/reports',
      '/ops/admin/audit',
      '/ops',
      '/ops/settings/reference-data',
      '/ops/admin/staff',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expectNoHorizontalScroll(`ops ${path}`, page);
    }

    await shot(page, testInfo, 'responsive-ops-dashboard');
    guards.assertClean();
  });
});
