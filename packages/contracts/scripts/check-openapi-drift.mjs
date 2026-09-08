#!/usr/bin/env node
/**
 * Fails if the API's generated OpenAPI document references response schemas whose stable
 * error codes are not in @carrental/contracts (SRS-API-002/004). Runs in `verify:static`
 * once the API can emit its OpenAPI JSON; until then it is a no-op that reports "skipped".
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, '../../../apps/api/openapi.json');

if (!existsSync(openapiPath)) {
  console.log('check:drift — openapi.json not generated yet, skipping.');
  process.exit(0);
}

const { ERROR_CODE } = await import('../src/errors.js').catch(() => ({ ERROR_CODE: {} }));
const known = new Set(Object.values(ERROR_CODE));
const doc = JSON.parse(readFileSync(openapiPath, 'utf8'));
const text = JSON.stringify(doc);

const referenced = [...text.matchAll(/"code"\s*:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const unknown = referenced.filter((c) => c && !known.has(c) && c.includes('_'));

if (unknown.length) {
  console.error('OpenAPI references error codes missing from @carrental/contracts:', [
    ...new Set(unknown),
  ]);
  process.exit(1);
}
console.log(`check:drift — OK (${new Set(referenced).size} error codes referenced, all known).`);
