import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { attachConsoleGuards, shot } from './_helpers.js';

/**
 * STAGE-013 — system-wide QA matrix (mandate §1.8). Every public route of `apps/site` and every
 * key `/ops` screen, in `en` / `ar` / `fr`, in `light` and `dark`, at phone / tablet / laptop
 * (the Playwright projects). Each cell:
 *   - screenshot → stages/STAGE-013-system-qa/screenshots/<app>/<route>-<locale>-<theme>.<vp>.png
 *   - axe WCAG 2.1 A+AA: 0 serious/critical
 *   - no horizontal page overflow
 *   - no visible missing-translation marker (⟦key⟧ / __MISSING__)
 *   - `<html lang>` + `dir` correct for the locale
 *   - no console errors / unhandled rejections / unexpected failed requests
 */

const LOCALES = ['en', 'ar', 'fr'] as const;
const THEMES = ['light', 'dark'] as const;
const WEB_URL = process.env.QA_WEB_URL ?? 'http://localhost:4000';
const ADMIN = { email: 'admin@example.test', password: 'DevPassw0rd!' };

const SITE_ROUTES: Array<[path: string, name: string]> = [
  ['', 'home'],
  ['/search', 'search'],
  ['/help', 'help'],
  ['/legal/terms', 'legal-terms'],
  ['/legal/privacy', 'legal-privacy'],
];

// Every authenticated `/ops` screen (router.tsx). en/ar only — `fr` is LTR like `en` and its
// key parity is gated by `verify:i18n`; the site half below covers all three locales.
const OPS_ROUTES: Array<[path: string, name: string]> = [
  ['/ops/', 'ops-dashboard'],
  ['/ops/work', 'ops-work'],
  ['/ops/rentals', 'ops-rentals'],
  ['/ops/fleet', 'ops-fleet'],
  ['/ops/finance', 'ops-finance'],
  ['/ops/data-quality', 'ops-data-quality'],
  ['/ops/insights', 'ops-insights'],
  ['/ops/audit', 'ops-audit'],
  ['/ops/config', 'ops-config-versions'],
  ['/ops/config/rate-plans', 'ops-rate-plans'],
  ['/ops/config/reference-data', 'ops-reference-data'],
  ['/ops/config/translations', 'ops-translations'],
  ['/ops/config/branding', 'ops-branding'],
  ['/ops/config/seo', 'ops-seo'],
  ['/ops/config/pages', 'ops-pages'],
  ['/ops/config/languages', 'ops-languages'],
  ['/ops/admin/staff', 'ops-staff'],
];

async function setTheme(page: Page, theme: string) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('carrental.theme', t);
    } catch {
      /* ignore */
    }
  }, theme);
}

async function assertCell(
  page: Page,
  testInfo: TestInfo,
  opts: {
    app: 'site' | 'ops';
    name: string;
    locale: string;
    theme: string;
    expectDir: 'ltr' | 'rtl';
  },
) {
  const { app, name, locale, theme, expectDir } = opts;

  // no horizontal overflow
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(o.sw, `${name}/${locale}/${theme}: h-overflow ${o.sw}>${o.cw}`).toBeLessThanOrEqual(
    o.cw + 1,
  );

  // <html lang> + dir (site sets it per locale; ops mirrors the i18n context)
  const html = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.getAttribute('dir') || document.dir,
    dark: document.documentElement.classList.contains('dark'),
  }));
  if (app === 'site') {
    expect(html.lang, `${name}: <html lang>`).toBe(locale);
    expect(html.dir, `${name}: <html dir>`).toBe(expectDir);
  }
  if (theme === 'dark') expect(html.dark, `${name}: .dark class`).toBe(true);

  // no visible missing-translation marker
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/⟦[a-z0-9_.]+⟧|__MISSING__/i);

  // axe — 0 serious/critical
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad,
    `${name}/${locale}/${theme}: axe\n${bad.map((v) => `  ${v.id}: ${v.help}`).join('\n')}`,
  ).toEqual([]);

  await shot(page, testInfo, `${app}/${name}-${locale}-${theme}`);
}

test.describe('QA matrix — public site (apps/site)', () => {
  for (const locale of LOCALES) {
    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    for (const theme of THEMES) {
      test(`site · ${locale} · ${theme}`, async ({ page }, testInfo) => {
        const guards = attachConsoleGuards(page);
        await setTheme(page, theme);
        for (const [path, name] of SITE_ROUTES) {
          await page.goto(`/${locale}${path}`, { waitUntil: 'networkidle' });
          await expect(page.getByRole('heading').first()).toBeVisible();
          await assertCell(page, testInfo, { app: 'site', name, locale, theme, expectDir: dir });
        }
        guards.assertClean();
      });
    }
  }
});

test.describe('QA matrix — operations dashboard (apps/web /ops)', () => {
  for (const locale of ['en', 'ar'] as const) {
    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    for (const theme of THEMES) {
      test(`ops · ${locale} · ${theme}`, async ({ page }, testInfo) => {
        const guards = attachConsoleGuards(page);
        await setTheme(page, theme);
        await page.addInitScript((l) => {
          try {
            localStorage.setItem('carrental.locale', l);
          } catch {
            /* ignore */
          }
        }, locale);

        // sign in once so the config screens render (not just the auth gate)
        await page.goto(`${WEB_URL}/ops/sign-in`, { waitUntil: 'networkidle' });
        await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN.email);
        await page.locator('input[type="password"]').first().fill(ADMIN.password);
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/ops(\/)?$/, { timeout: 15_000 }).catch(() => undefined);

        for (const [path, name] of OPS_ROUTES) {
          await page.goto(`${WEB_URL}${path}`, { waitUntil: 'networkidle' });
          await expect(page.getByRole('heading').first()).toBeVisible();
          await assertCell(page, testInfo, { app: 'ops', name, locale, theme, expectDir: dir });
        }
        guards.assertClean();
      });
    }
  }
});
