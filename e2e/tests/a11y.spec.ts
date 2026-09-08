import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: Array<{ target: string[]; html?: string; failureSummary?: string }>;
}

/**
 * STAGE-007 — accessibility (SRS-NFR a11y, SRS-UI-007..012). axe-core (WCAG 2.1 A + AA rule
 * set) over the critical customer and operations screens. Fails on any `serious` or `critical`
 * violation; `moderate`/`minor` are printed for follow-up but do not fail the gate.
 * Runs on the laptop project only (rule outcomes are viewport-independent for these checks).
 */

const CUSTOMER = { email: 'customer@example.test', password: 'DevPassw0rd!' };
const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };
const IMPACT_FAIL = new Set(['serious', 'critical']);

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations as unknown as AxeViolation[];
  const blocking = violations.filter((v) => IMPACT_FAIL.has(v.impact ?? ''));
  const softer = violations.filter((v) => !IMPACT_FAIL.has(v.impact ?? ''));
  if (softer.length) {
    // eslint-disable-next-line no-console -- intentional diagnostic for the a11y follow-up list
    console.log(
      `[a11y] ${label}: ${softer.length} non-blocking — ` +
        softer.map((v) => `${v.id}(${v.impact})`).join(', '),
    );
  }
  const detail = blocking
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 4)
        .map(
          (n) =>
            `      ${n.target.join(' ')}\n        ${(n.failureSummary ?? '').replace(/\n/g, ' ')}\n        ${(n.html ?? '').slice(0, 140)}`,
        )
        .join('\n');
      return `  ${v.id} (${v.impact}) — ${v.help}\n${nodes}`;
    })
    .join('\n');
  expect(
    blocking,
    `${label}: ${blocking.length} serious/critical a11y violation(s)\n${detail}`,
  ).toEqual([]);
}

test.describe('accessibility (axe-core)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe run once on chromium');

  test('customer surfaces have no serious/critical a11y violations', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a11y audited on the laptop project');
    const guards = attachConsoleGuards(page);

    for (const path of ['/', '/search', '/sign-in', '/register']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await audit(page, `cweb ${path}`);
    }

    // signed-in surfaces
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: false }).fill(CUSTOMER.email);
    await page.getByLabel('Password', { exact: false }).fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/account$/);
    for (const path of ['/account', '/account/profile', '/account/drivers', '/trips']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await audit(page, `cweb ${path}`);
    }
    await shot(page, testInfo, 'a11y-cweb-account');
    guards.assertClean();
  });

  test('operations surfaces have no serious/critical a11y violations', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a11y audited on the laptop project');
    const guards = attachConsoleGuards(page);

    await page.goto('/ops/sign-in');
    await page.getByLabel('Staff email', { exact: false }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: false }).fill(ADMIN.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/ops$/);

    for (const path of [
      '/ops',
      '/ops/work',
      '/ops/rentals',
      '/ops/fleet',
      '/ops/config',
      '/ops/insights',
      '/ops/audit',
      '/ops/config/reference-data',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await audit(page, `ops ${path}`);
    }
    await shot(page, testInfo, 'a11y-ops-config');
    guards.assertClean();
  });
});
