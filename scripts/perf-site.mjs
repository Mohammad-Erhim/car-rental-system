#!/usr/bin/env node
/**
 * apps/site performance budget (STAGE-011/013, enhancement-program §6). Loads each key route
 * from a **running production build** and measures what a first visit actually downloads: the
 * `<script src>` set the server put in the HTML, the HTML weight, render-blocking resources,
 * and unsized `<img>` (CLS). A full Lighthouse LCP/INP run is CI-optional (needs Chrome); this
 * catches the JS/HTML/layout-shift regressions that matter.
 *
 * Transfer size is the **per-file Brotli sum** — what a CDN serving `content-encoding: br`
 * actually puts on the wire (each asset compressed independently, all multiplexed over one
 * HTTP/2 connection). The gzip sum is printed alongside for reference only; it over-counts
 * (gzip is weaker than brotli and a per-file sum shares no dictionary) and is not the gate.
 *
 * Budgets re-baselined 2026-09-08 (D-013-6) against the measured Next.js 14 App Router client
 * floor: framework + react-dom + the app-router runtime + core-js polyfills is ~185 KB br
 * before a line of app code, and every route also carries the i18n message catalogue (en/ar/fr)
 * and the shared theme + UI runtime the root layout mounts. The budget is that floor plus
 * headroom, not an aspirational round number — a gate that can never go green is not a gate.
 *
 *   SITE_PERF_BASE=http://localhost:3000 node scripts/perf-site.mjs
 */
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';

const base = (process.env.SITE_PERF_BASE ?? 'http://localhost:3000').replace(/\/$/, '');

/** first-load JS budget — per-file Brotli sum. Public marketing routes are tighter than the
 *  authed/interactive ones (forms, the react-query cache, confirm dialogs). Measured after the
 *  D-013-6 fix: static routes ~223 KB br, authed routes ~233 KB br; these carry ~13–22 % headroom. */
const BUDGET = {
  public: 260 * 1024,
  interactive: 285 * 1024,
  html: 52 * 1024,
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

const brotli = (buf) =>
  brotliCompressSync(buf, {
    params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: buf.length },
  }).length;
const gzip = (buf) => gzipSync(buf).length;

async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log(`perf-site — ${base}  (transfer = per-file Brotli q11; gzip shown for reference)`);
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
      html = (await fetchBuf(base + path)).toString();
    } catch (e) {
      fail(`${path}: ${e.message}`);
      continue;
    }

    const htmlBr = brotli(Buffer.from(html));
    if (htmlBr > BUDGET.html) fail(`${path}: HTML ${kb(htmlBr)} br > ${kb(BUDGET.html)}`);

    // the <script src> set the server emitted = first-load JS
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*>/g)].map((m) => m[1]);
    const uniq = [...new Set(srcs)];
    let jsBr = 0;
    let jsGz = 0;
    const perFile = [];
    for (const s of uniq) {
      const u = s.startsWith('http') ? s : base + s;
      try {
        const buf = await fetchBuf(u);
        const b = brotli(buf);
        jsBr += b;
        jsGz += gzip(buf);
        perFile.push({ s, b });
      } catch (e) {
        fail(`${path}: ${e.message}`);
      }
    }
    const budget = BUDGET[kind];
    if (jsBr > heaviest.bytes) heaviest = { path, bytes: jsBr };
    if (jsBr > budget) {
      fail(
        `${path}: first-load JS ${kb(jsBr)} br (gzip ${kb(jsGz)}, ${uniq.length} files) > ${kb(budget)}`,
      );
      perFile.sort((a, b) => b.b - a.b);
      for (const { s, b } of perFile.slice(0, 5)) {
        console.error(`      ${kb(b).padStart(9)}  ${s.replace(/^.*\/chunks\//, 'chunks/')}`);
      }
    }

    // render-blocking sync <script> in <head>: a bare `<script src>` with no async / defer /
    // nomodule / type=module. Next always emits one `nomodule` legacy-polyfills script — inert
    // on the modern baseline, so it is not counted.
    const head = html.slice(0, html.indexOf('</head>') + 7);
    const sync = (
      head.match(
        /<script(?![^>]*\b(?:async|defer|nomodule)\b)(?![^>]*type="(?:application\/json|module)")[^>]*\ssrc=/gi,
      ) || []
    ).length;
    if (sync > 0) fail(`${path}: ${sync} render-blocking <script> in <head>`);

    // <img> without width/height → layout shift
    const badImg = (html.match(/<img(?![^>]*\b(?:width|height)=)[^>]*>/g) || []).length;
    if (badImg > 0) fail(`${path}: ${badImg} <img> without width/height (CLS risk)`);

    if (jsBr <= budget && htmlBr <= BUDGET.html && sync === 0 && badImg === 0) {
      ok(`${path} — JS ${kb(jsBr)} br / ${kb(jsGz)} gz (≤ ${kb(budget)}), HTML ${kb(htmlBr)} br`);
    }
  }
  if (heaviest.path)
    console.log(`  · heaviest first-load JS: ${heaviest.path} ${kb(heaviest.bytes)} br`);

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
