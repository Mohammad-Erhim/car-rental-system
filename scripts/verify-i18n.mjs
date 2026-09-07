#!/usr/bin/env node
/**
 * verify:i18n (STAGE-010, DEC-024) — guards that changing the language never yields a
 * partially-translated screen.
 *
 *   node scripts/verify-i18n.mjs            # completeness + ICU parity for the active locales
 *   node scripts/verify-i18n.mjs --strict   # additionally fail on likely un-i18n'd literals
 *
 * The default locale (en) is the source of truth for the key set. Every other ACTIVE locale
 * must define every key, with a non-empty value and a matching ICU placeholder set.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'packages/i18n/src/locales');

// Active launch locales (DEC-024). Keep in sync with the `system` seed / LOCALES config.
const DEFAULT_LOCALE = 'en';
const ACTIVE_LOCALES = ['en', 'ar', 'fr'];

const strict = process.argv.includes('--strict');
let failures = 0;
const note = (m) => console.log(m);
const fail = (m) => {
  failures++;
  console.error('✗ ' + m);
};

/** locale -> { "ns.key": value }, flattening nested JSON and prefixing the namespace (file). */
function loadLocale(loc) {
  const dir = join(localesDir, loc);
  if (!existsSync(dir)) return null;
  const out = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const walk = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
        else out[ns === 'common' ? key : `${ns}.${key}`] = v;
      }
    };
    walk(json, '');
  }
  return out;
}

/** ICU/`intl-messageformat` argument names used in a message: `{name}`, `{n, plural, …}`. */
function placeholders(msg) {
  const set = new Set();
  const re = /\{\s*([a-zA-Z0-9_]+)\s*(?:,[^}]*)?\}/g;
  let m;
  while ((m = re.exec(String(msg)))) set.add(m[1]);
  return set;
}

const bundles = Object.fromEntries(ACTIVE_LOCALES.map((l) => [l, loadLocale(l)]));
const base = bundles[DEFAULT_LOCALE];
if (!base) {
  console.error(`no ${DEFAULT_LOCALE} locale bundle at ${localesDir}`);
  process.exit(2);
}
const baseKeys = Object.keys(base).sort();
note(`i18n: ${baseKeys.length} keys in ${DEFAULT_LOCALE}; checking ${ACTIVE_LOCALES.join(', ')}`);

for (const loc of ACTIVE_LOCALES) {
  const b = bundles[loc];
  if (!b) {
    fail(`${loc}: no locale bundle`);
    continue;
  }
  const missing = baseKeys.filter((k) => !(k in b));
  const empty = baseKeys.filter((k) => k in b && String(b[k] ?? '').trim() === '');
  const placeholderish = baseKeys.filter((k) =>
    /__MISSING__|^TODO\b|\bTBD\b|^FIXME/i.test(String(b[k] ?? '')),
  );
  const extra = Object.keys(b).filter((k) => !(k in base));
  const icuMismatch = [];
  for (const k of baseKeys) {
    if (!(k in b)) continue;
    const a = placeholders(base[k]);
    const c = placeholders(b[k]);
    if (a.size !== c.size || [...a].some((x) => !c.has(x))) {
      icuMismatch.push(`${k} (en:{${[...a]}} ${loc}:{${[...c]}})`);
    }
  }

  if (missing.length)
    fail(
      `${loc}: ${missing.length} missing key(s): ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`,
    );
  if (empty.length) fail(`${loc}: ${empty.length} empty value(s): ${empty.slice(0, 8).join(', ')}`);
  if (placeholderish.length)
    fail(
      `${loc}: ${placeholderish.length} placeholder value(s): ${placeholderish.slice(0, 8).join(', ')}`,
    );
  if (icuMismatch.length)
    fail(
      `${loc}: ${icuMismatch.length} ICU placeholder mismatch(es): ${icuMismatch.slice(0, 6).join('; ')}`,
    );
  if (extra.length && loc !== DEFAULT_LOCALE)
    note(
      `  ${loc}: ${extra.length} key(s) not in ${DEFAULT_LOCALE} (ignored): ${extra.slice(0, 6).join(', ')}`,
    );
  if (!missing.length && !empty.length && !placeholderish.length && !icuMismatch.length)
    note(`  ${loc}: complete ✓`);
}

/* ---- optional: likely un-i18n'd literals in the app surfaces (STAGE-010 extraction) -------- */
if (strict) {
  const { execSync } = await import('node:child_process');
  const paths = ['apps/web/src', 'apps/site/src', 'apps/site/app'].filter((p) =>
    existsSync(join(root, p)),
  );
  // JSX text / aria-label / placeholder / title with 2+ ASCII words, not wrapped in t(...) or {}
  const rg =
    `grep -rnE '(>[A-Z][a-zA-Z]+ [a-zA-Z]|(aria-label|placeholder|title)="[A-Z][a-zA-Z]+ )' ` +
    paths.map((p) => `'${p}'`).join(' ') +
    ` --include='*.tsx' | grep -vE '\\bt\\(|// *i18n-ok|data-testid' || true`;
  const hits = execSync(rg, { cwd: root }).toString().trim();
  const n = hits ? hits.split('\n').length : 0;
  if (n > 0) {
    console.error(`\n✗ --strict: ${n} line(s) look like un-i18n'd copy:`);
    console.error(hits.split('\n').slice(0, 30).join('\n'));
    failures++;
  } else {
    note('literals: none found in app surfaces ✓');
  }
}

if (failures) {
  console.error(`\ni18n check FAILED (${failures} problem group(s)).`);
  process.exit(1);
}
console.log('\ni18n check OK.');
