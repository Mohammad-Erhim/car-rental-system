#!/usr/bin/env node
/**
 * apps/site performance budget (STAGE-011/013, enhancement-program §6). Loads each key route
 * from a **running production build** and measures what a first visit actually downloads: the
 * `<script src>` set the server put in the HTML, gzipped, plus the HTML weight, render-blocking
 * resources, and unsized `<img>` (CLS). A full Lighthouse LCP/INP run is CI-optional (needs
 * Chrome); this catches the JS/HTML/layout-shift regressions that matter.
 *
 *   SITE_PERF_BASE=http://localhost:3000 node scripts/perf-site.mjs
 */
import { gzipSync } from 'node:zlib';

const base = (process.env.SITE_PERF_BASE ?? 'http://localhost:3000').replace(/\/$/, '');

/** first-load JS budget (gzipped transfer). Public marketing routes are tighter than the
 *  authed/interactive ones (react-query + forms). */
const BUDGET = {
  public: 170 * 1024,
  interactive: 240 * 1024,
  html: 60 * 1024,
};
const ROUTES = [
  ['/en', 'public'],
  ['/en/search?pickup=JFK&pickupAt=&returnAt=', 'public'],
  ['/en/help', 'public'],
  ['/en/vehicles/economy', 'public'],
  ['/en/legal/terms', 'public'],
  ['/en/sign-in', 'interactive'],
  ['/en/account', 'interactive'],
  ['/en/checkout', 'interactive'],
  ['/en/trips', 'interactive'],
];

let failures = 0;
const fail = (m) => {
  failures++;
  console.error('  ✗ ' + m);
};
const ok = (m) => console.log('  ✓ ' + m);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function gzOf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return gzipSync(Buffer.from(await res.arrayBuffer())).length;
}

async function main() {
  console.log(`perf-site — ${base}`);
  if (
    !(await fetch(`${base}/en`)
      .then((r) => r.ok)
      .catch(() => false))
  ) {
    console.error(`Site not reachable at ${base}/en. Start the production build first.`);
    process.exit(2);
  }

  let heaviest = { path: '', bytes: 0 };
  for (const [path, kind] of ROUTES) {
    let html;
    try {
      const res = await fetch(base + path);
      html = await res.text();
    } catch (e) {
      fail(`${path}: ${e.message}`);
      continue;
    }

    const htmlGz = gzipSync(Buffer.from(html)).length;
    if (htmlGz > BUDGET.html) fail(`${path}: HTML ${kb(htmlGz)} gz > ${kb(BUDGET.html)}`);

    // the <script src> set the server emitted = first-load JS
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*>/g)].map((m) => m[1]);
    const uniq = [...new Set(srcs)];
    let jsGz = 0;
    for (const s of uniq) {
      const u = s.startsWith('http') ? s : base + s;
      try {
        jsGz += await gzOf(u);
      } catch (e) {
        fail(`${path}: ${e.message}`);
      }
    }
    const budget = BUDGET[kind];
    if (jsGz > heaviest.bytes) heaviest = { path, bytes: jsGz };
    if (jsGz > budget) {
      fail(`${path}: first-load JS ${kb(jsGz)} gz (${uniq.length} files) > ${kb(budget)}`);
    }

    // render-blocking sync <script> in <head>
    const head = html.slice(0, html.indexOf('</head>') + 7);
    const sync = (
      head.match(
        /<script(?![^>]*\b(?:async|defer)\b)(?![^>]*type="application\/json")[^>]*\ssrc=/g,
      ) || []
    ).length;
    if (sync > 0) fail(`${path}: ${sync} render-blocking <script> in <head>`);

    // <img> without width/height → layout shift
    const badImg = (html.match(/<img(?![^>]*\b(?:width|height)=)[^>]*>/g) || []).length;
    if (badImg > 0) fail(`${path}: ${badImg} <img> without width/height (CLS risk)`);

    if (jsGz <= budget && htmlGz <= BUDGET.html && sync === 0 && badImg === 0) {
      ok(`${path} — JS ${kb(jsGz)} gz (≤ ${kb(budget)}), HTML ${kb(htmlGz)} gz`);
    }
  }
  if (heaviest.path)
    console.log(`  · heaviest first-load JS: ${heaviest.path} ${kb(heaviest.bytes)} gz`);

  if (failures) {
    console.error(`\nperf-site FAILED — ${failures} budget issue(s).`);
    process.exit(1);
  }
  console.log('\nperf-site OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
