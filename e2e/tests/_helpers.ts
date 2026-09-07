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
    if (res.status() >= 400 && !res.url().includes('/favicon')) {
      failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
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
