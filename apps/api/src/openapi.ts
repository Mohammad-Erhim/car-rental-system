/**
 * Emits ./openapi.json from the live Nest metadata (SRS-API-002).
 * Run in verify:static so the committed contract stays in sync and drift-checked.
 * Reuses createApp() (the same wiring the server uses) then dumps its Swagger document.
 */
import 'reflect-metadata';
import './config/bootstrap-env';

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createApp, openapiDocument } from './bootstrap';

async function main() {
  const app = await createApp();
  await app.close();

  const doc = openapiDocument as { paths?: Record<string, unknown> } | null;
  if (!doc) throw new Error('openapi document not produced by createApp()');

  const out = resolve(process.cwd(), 'openapi.json');
  const rendered = JSON.stringify(doc, null, 2) + '\n';
  const pathCount = Object.keys(doc.paths ?? {}).length;

  // `--check` (verify:static): fail if the committed document is stale, don't rewrite it.
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(out, 'utf8');
    } catch {
      /* missing file → treated as drift below */
    }
    if (current !== rendered) {
      process.stderr.write(
        `[openapi] ✖ apps/api/openapi.json is stale (${pathCount} paths from code). ` +
          `Run \`pnpm openapi:generate\` and commit the result.\n`,
      );
      process.exit(1);
    }
    process.stderr.write(`[openapi] check OK (${pathCount} paths).\n`);
    process.exit(0);
  }

  writeFileSync(out, rendered, 'utf8');
  process.stderr.write(`[openapi] wrote ${out} (${pathCount} paths)\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[openapi] FAILED: ${err?.stack ?? String(err)}\n`);
  process.exit(1);
});
