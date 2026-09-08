#!/usr/bin/env node
/**
 * Writes the default design-token block from `@carrental/theme` into the two stylesheets that
 * carry it, between `/* @carrental/theme:start *␘/` and `/* @carrental/theme:end *␘/` markers.
 * This is what makes `packages/theme` the single source of truth — the old "keep the two
 * styles.css copies in sync by hand" footgun (STAGE-007 note) is now enforced.
 *
 *   node scripts/gen-tokens-css.mjs           # rewrite the files
 *   node scripts/gen-tokens-css.mjs --check   # exit 1 if any file is out of date (verify:theme)
 *
 * Run via the compiled dist so it needs no TS loader.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND_CONFIG } from '../dist/schema.js';
import { resolveCssVars } from '../dist/resolve.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const TARGETS = [
  'packages/ui/src/styles.css',
  'apps/web/src/index.css',
  'apps/site/src/app/globals.css',
];

const START = '/* @carrental/theme:start';
const END = '/* @carrental/theme:end */';

function tokenBlock(indent = '  ') {
  const light = resolveCssVars(DEFAULT_BRAND_CONFIG, 'light');
  const dark = resolveCssVars(DEFAULT_BRAND_CONFIG, 'dark');
  const i = indent;
  const i2 = indent + '  ';
  const line = (k, v) => `${i2}${k}: ${v};`;
  const lightLines = Object.entries(light).map(([k, v]) => line(k, v));
  const darkLines = Object.entries(dark)
    .filter(([k, v]) => light[k] !== v)
    .map(([k, v]) => line(k, v));
  return [
    `${START} — generated from @carrental/theme. Edit tokens in packages/theme/src/tokens.ts,`,
    `${i}   then \`pnpm --filter @carrental/theme gen:css\`. Do not hand-edit between the markers. */`,
    `${i}:root {`,
    ...lightLines,
    `${i}}`,
    ``,
    `${i}.dark {`,
    ...darkLines,
    `${i}}`,
    `${i}${END}`,
  ].join('\n');
}

const BLOCK = tokenBlock('  ');
const rx = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
);

const check = process.argv.includes('--check');
let stale = 0;

for (const rel of TARGETS) {
  const path = resolve(repoRoot, rel);
  const src = readFileSync(path, 'utf8');
  if (!rx.test(src)) {
    console.error(
      `[gen-tokens-css] ${rel}: missing ${START} … ${END} markers — add them inside @layer base.`,
    );
    process.exitCode = 1;
    continue;
  }
  const next = src.replace(rx, BLOCK);
  if (next === src) {
    console.log(`[gen-tokens-css] ${rel}: up to date`);
    continue;
  }
  stale++;
  if (check) {
    console.error(
      `[gen-tokens-css] ${rel}: OUT OF DATE — run \`pnpm --filter @carrental/theme gen:css\``,
    );
  } else {
    writeFileSync(path, next);
    console.log(`[gen-tokens-css] ${rel}: rewritten`);
  }
}

if (check && stale > 0) process.exitCode = 1;
