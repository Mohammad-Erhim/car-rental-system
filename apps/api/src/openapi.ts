/**
 * Emits ./openapi.json from the live Nest metadata (SRS-API-002).
 * Run in verify:static so the committed contract stays in sync and drift-checked.
 * Reuses createApp() (the same wiring the server uses) then dumps its Swagger document.
 */
import 'reflect-metadata';
import './config/bootstrap-env';

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createApp, openapiDocument } from './bootstrap';

async function main() {
  const app = await createApp();
  await app.close();

  const doc = openapiDocument as { paths?: Record<string, unknown> } | null;
  if (!doc) throw new Error('openapi document not produced by createApp()');

  const out = resolve(process.cwd(), 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  process.stderr.write(`[openapi] wrote ${out} (${Object.keys(doc.paths ?? {}).length} paths)\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[openapi] FAILED: ${err?.stack ?? String(err)}\n`);
  process.exit(1);
});
