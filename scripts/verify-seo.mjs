#!/usr/bin/env node
/**
 * verify:seo (STAGE-011 / STAGE-013) — technical-SEO gate for `apps/site`.
 *
 * Against a running built site (`SEO_BASE_URL`, default http://localhost:3000) it asserts, for
 * every indexable route × {en, ar, fr}:
 *   - a unique, non-empty <title> and a non-empty meta description
 *   - <link rel=canonical> that matches the route's own locale + path
 *   - hreflang alternates for en/ar/fr + x-default, reciprocal across locales
 *   - <html lang> + dir correct for the locale
 *   - OG (og:title/type/url/image) + twitter:card
 *   - every application/ld+json block parses
 * plus: robots.txt has a Sitemap: line; sitemap.xml is valid XML, lists the indexable routes,
 * and gives each <url> xhtml:link alternates; and the private routes (/[locale]/account,
 * /[locale]/checkout, /[locale]/trips) are noindex.
 */
const BASE = (process.env.SEO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const LOCALES = ['en', 'ar', 'fr'];
const DIR = { en: 'ltr', ar: 'rtl', fr: 'ltr' };

/** Indexable route paths (locale-agnostic, leading slash). Keep in sync with sitemap.ts. */
const INDEXABLE = ['/', '/search', '/help', '/vehicles/economy', '/legal/terms', '/legal/privacy'];
const PRIVATE = ['/account', '/checkout', '/trips'];

let failures = 0;
const fail = (m) => {
  failures++;
  console.error('  ✗ ' + m);
};
const ok = (m) => console.log('  ✓ ' + m);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { 'accept-language': 'en' },
  });
  const body = await res.text();
  return { status: res.status, body, headers: res.headers };
}

const attr = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};
const metaContent = (html, name) =>
  attr(
    html,
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'),
  ) ??
  attr(
    html,
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'),
  );

function linkAlternates(html) {
  const out = {};
  const re = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  for (const tag of html.match(re) ?? []) {
    const hreflang = attr(tag, /hreflang=["']([^"']+)["']/i);
    const href = attr(tag, /href=["']([^"']+)["']/i);
    if (hreflang && href) out[hreflang] = href;
  }
  return out;
}

const titles = new Map();

async function checkRoute(path) {
  for (const loc of LOCALES) {
    const url = `/${loc}${path === '/' ? '' : path}`;
    const { status, body } = await get(url);
    if (status !== 200) {
      fail(`${url} → HTTP ${status}`);
      continue;
    }
    const title = attr(body, /<title[^>]*>([^<]*)<\/title>/i);
    if (!title) fail(`${url}: no <title>`);
    else {
      const seen = titles.get(title);
      if (seen && seen !== `${loc}${path}`) fail(`${url}: <title> "${title}" duplicates ${seen}`);
      titles.set(title, `${loc}${path}`);
    }

    const desc = metaContent(body, 'description');
    if (!desc || desc.length < 20) fail(`${url}: weak/missing meta description`);

    const canonical = attr(body, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (!canonical) fail(`${url}: no rel=canonical`);
    else if (!canonical.endsWith(url) && !(path === '/' && canonical.endsWith(`/${loc}`)))
      fail(`${url}: canonical "${canonical}" does not match the route`);

    const alts = linkAlternates(body);
    for (const l of [...LOCALES, 'x-default']) {
      if (!alts[l]) fail(`${url}: missing hreflang="${l}" alternate`);
    }
    // reciprocity: the en alternate URL must itself list this locale's URL
    if (alts.en) {
      const enPath = new URL(alts.en).pathname;
      const { body: enBody, status: enStatus } = await get(enPath);
      if (enStatus === 200) {
        const back = linkAlternates(enBody)[loc];
        if (!back || new URL(back).pathname !== url)
          fail(`${url}: hreflang not reciprocal from ${enPath}`);
      }
    }

    const lang = attr(body, /<html[^>]+lang=["']([^"']+)["']/i);
    const dir = attr(body, /<html[^>]+dir=["']([^"']+)["']/i);
    if (lang !== loc) fail(`${url}: <html lang> is "${lang}", expected "${loc}"`);
    if (dir !== DIR[loc]) fail(`${url}: <html dir> is "${dir}", expected "${DIR[loc]}"`);

    for (const [prop, label] of [
      ['og:title', 'og:title'],
      ['og:type', 'og:type'],
      ['og:url', 'og:url'],
      ['og:image', 'og:image'],
    ]) {
      if (!metaContent(body, prop)) fail(`${url}: missing ${label}`);
    }
    if (!metaContent(body, 'twitter:card')) fail(`${url}: missing twitter:card`);

    for (const block of body.match(
      /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
    ) ?? []) {
      const json = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
      try {
        JSON.parse(json);
      } catch {
        fail(`${url}: invalid JSON-LD block`);
      }
    }
  }
  ok(`${path} — title/description/canonical/hreflang/lang/OG/JSON-LD across ${LOCALES.join('/')}`);
}

async function checkRobots() {
  const { status, body } = await get('/robots.txt');
  if (status !== 200) return fail(`robots.txt → HTTP ${status}`);
  if (!/user-agent:/i.test(body)) fail('robots.txt: no User-agent line');
  if (!/^sitemap:\s*https?:\/\/\S+/im.test(body)) fail('robots.txt: no Sitemap: line');
  else ok('robots.txt — User-agent + Sitemap present');
}

async function checkSitemap() {
  const { status, body } = await get('/sitemap.xml');
  if (status !== 200) return fail(`sitemap.xml → HTTP ${status}`);
  if (!body.includes('<urlset')) return fail('sitemap.xml: not a <urlset>');
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const path of INDEXABLE) {
    const want = `/${LOCALES[0]}${path === '/' ? '' : path}`;
    if (!locs.some((l) => new URL(l).pathname === want))
      fail(`sitemap.xml: missing an entry for ${want}`);
  }
  if (!body.includes('hreflang=') || !body.includes('xhtml:link'))
    fail('sitemap.xml: entries lack xhtml:link hreflang alternates');
  else ok(`sitemap.xml — ${locs.length} <loc> entries, hreflang alternates present`);
}

async function checkPrivateNoindex() {
  for (const path of PRIVATE) {
    const url = `/en${path}`;
    const { status, body } = await get(url);
    if (status !== 200) {
      fail(`${url} → HTTP ${status} (expected a 200 noindex shell)`);
      continue;
    }
    const robots = metaContent(body, 'robots') ?? '';
    if (!/noindex/i.test(robots)) fail(`${url}: expected robots noindex, got "${robots}"`);
  }
  ok(`private routes noindex — ${PRIVATE.join(', ')}`);
}

async function main() {
  console.log(`verify:seo — ${BASE}`);
  const health = await get('/en').catch(() => ({ status: 0 }));
  if (health.status !== 200) {
    console.error(`\nSite not reachable at ${BASE}/en (HTTP ${health.status}). Start it first.`);
    process.exit(2);
  }
  for (const path of INDEXABLE) await checkRoute(path);
  await checkRobots();
  await checkSitemap();
  await checkPrivateNoindex();

  if (failures) {
    console.error(`\nverify:seo FAILED — ${failures} problem(s).`);
    process.exit(1);
  }
  console.log('\nverify:seo OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
