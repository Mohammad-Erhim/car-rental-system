/**
 * Regenerates `apps/site/public/og-default.png` (1200×630) — the fallback Open Graph / Twitter
 * card image used when the dashboard SEO config sets no `ogImageUrl` (SRS-ADM-006).
 *
 * Needs Playwright's Chromium (only installed under `e2e/`), so run it from there:
 *
 *   cd e2e && node ../apps/site/scripts/gen-og-default.mjs
 */
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const OUT = fileURLToPath(new URL('../public/og-default.png', import.meta.url));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;display:flex;flex-direction:column;justify-content:space-between;
    padding:80px;font-family:Inter,system-ui,Arial,sans-serif;color:#0f172a;
    background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 55%,#e0e7ff 100%)}
  .brand{display:flex;align-items:center;gap:20px;font-size:34px;font-weight:700;letter-spacing:-.02em}
  .mark{width:64px;height:64px;border-radius:16px;background:#4f46e5;display:flex;align-items:center;justify-content:center;color:#fff;font-size:34px}
  h1{font-size:76px;font-weight:800;line-height:1.05;letter-spacing:-.03em;max-width:960px}
  p{font-size:32px;color:#475569;margin-top:24px;max-width:900px}
  .row{display:flex;gap:16px}
  .pill{font-size:24px;font-weight:600;color:#4338ca;background:#fff;border:1px solid #c7d2fe;border-radius:999px;padding:12px 24px}
</style></head><body>
  <div class="brand"><div class="mark">↻</div>Car Rental</div>
  <div><h1>Book a vehicle in minutes</h1>
    <p>A modern fleet, transparent pricing, flexible pickup, and 24/7 support.</p></div>
  <div class="row"><span class="pill">Economy → Premium</span><span class="pill">Instant confirmation</span><span class="pill">No hidden fees</span></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 1200, height: 630 } })
  .then((c) => c.newPage());
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log('wrote', OUT);
