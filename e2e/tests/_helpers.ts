import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { expect, type Page, type TestInfo } from '@playwright/test';

const SHOTS_ROOT = resolve(
  process.env.E2E_SCREENSHOT_DIR ??
    '../docs/ai-delivery/04-implementation/stages/STAGE-000-platform/screenshots',
);

/** Console errors + failed responses that must not occur on a healthy journey (SRS-UI-014). */
export function attachConsoleGuards(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // allow-list: nothing yet
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    // Expected, handled negative responses (not defects):
    //  - session probe with no cookie yet
    //  - a deliberate wrong-code / invalid-credentials assertion in a test
    const expectedNegative =
      (status === 401 && /\/auth\/(refresh|me)\b/.test(url)) ||
      (status === 401 && /\/auth\/sign-in\b/.test(url)) ||
      (status === 422 && /\/auth\/verify-contact\b/.test(url));
    if (status >= 400 && !url.includes('/favicon') && !expectedNegative) {
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

/** Save a named, deterministic screenshot into the stage evidence folder. */
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  const project = testInfo.project.name; // phone | tablet | laptop
  const file = resolve(SHOTS_ROOT, `${name}.${project}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${name}.${project}`, { path: file, contentType: 'image/png' });
}
