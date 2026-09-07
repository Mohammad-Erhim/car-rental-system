import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { expect, type Page, type TestInfo } from '@playwright/test';

const SHOTS_ROOT = resolve(
  process.env.E2E_SCREENSHOT_DIR ??
    '../docs/ai-delivery/04-implementation/stages/STAGE-000-platform/screenshots',
);

/**
 * URL + status combinations a healthy journey may legitimately produce (a session probe with no
 * cookie, a deliberate wrong-credentials / declined-card assertion in a test). Both the
 * `response` guard and the browser's automatic "Failed to load resource" console error are
 * checked against this.
 */
function isExpectedNegative(url: string, status: number): boolean {
  return (
    ((status === 401 || status === 403) && /\/auth\/(refresh|me|sign-out)\b/.test(url)) ||
    (status === 401 && /\/auth\/sign-in\b/.test(url)) ||
    (status === 422 && /\/auth\/verify-contact\b/.test(url)) ||
    ((status === 422 || status === 504) && /\/bookings\/confirm\b/.test(url)) ||
    (status === 401 && /\/bookings\/[^/]+/.test(url))
  );
}

/** Console errors + failed responses that must not occur on a healthy journey (SRS-UI-014). */
export function attachConsoleGuards(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Chromium logs "Failed to load resource: the server responded with a status of NNN" for
    // every 4xx/5xx fetch — allow the ones a test deliberately provokes and asserts on.
    const m = text.match(/status of (\d{3})/);
    if (m) {
      const status = Number(m[1]);
      const loc = msg.location()?.url ?? '';
      if (isExpectedNegative(loc, status)) return;
    }
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 400 && !url.includes('/favicon') && !isExpectedNegative(url, status)) {
      failedRequests.push(`${status} ${res.request().method()} ${url}`);
    }
  });

  return {
    assertClean() {
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
      expect(failedRequests, `failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
    },
    consoleErrors,
    failedRequests,
    pageErrors,
  };
}

/** Save a named, deterministic screenshot into the stage evidence folder. A full-page capture of
 *  a long table page at the phone project's deviceScaleFactor 3 can exceed the default 10s on a
 *  memory-constrained host — allow it 30s. */
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  const project = testInfo.project.name; // phone | tablet | laptop
  const file = resolve(SHOTS_ROOT, `${name}.${project}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 30_000 });
  await testInfo.attach(`${name}.${project}`, { path: file, contentType: 'image/png' });
}
