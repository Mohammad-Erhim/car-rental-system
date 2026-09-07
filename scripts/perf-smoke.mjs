/**
 * STAGE-007 performance smoke (SRS-NFR budgets). Runs autocannon against a running API and
 * checks p95 latency against a per-endpoint budget. Indicative only — this host is
 * memory-constrained and the API runs single-process; production numbers will differ.
 *
 *   node scripts/perf-smoke.mjs [--base http://localhost:3001] [--json]
 *
 * Exit non-zero if any endpoint's p95 exceeds its budget.
 */
import autocannon from 'autocannon';

const args = process.argv.slice(2);
const base = argValue('--base') ?? process.env.PERF_BASE ?? 'http://localhost:3001';
const asJson = args.includes('--json');

const soon = (days, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** [name, budgetP95ms, request] */
const CASES = [
  ['GET /health/ready', 150, { path: '/health/ready' }],
  ['GET /api/v1/meta/locales', 120, { path: '/api/v1/meta/locales' }],
  [
    'POST /api/v1/discovery/search',
    600,
    {
      path: '/api/v1/discovery/search',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pickupLocationCode: 'JFK',
        pickupAt: soon(10),
        returnAt: soon(13),
        categoryCode: 'economy',
      }),
    },
  ],
];

/** correctness pre-flight: N real fetches, every one must be 2xx (autocannon's own status
 *  accounting is unreliable against a very fast keep-alive server on a small host). */
async function probe(name, req) {
  let bad = 0;
  for (let i = 0; i < 25; i++) {
    const res = await fetch(base + req.path, {
      method: req.method ?? 'GET',
      headers: req.headers,
      body: req.body,
    });
    if (!res.ok) bad++;
    await res.arrayBuffer();
  }
  if (bad) console.error(`  probe ${name}: ${bad}/25 non-2xx`);
  return bad;
}

async function run() {
  const results = [];
  for (const [name, budget, req] of CASES) {
    const badProbe = await probe(name, req);
    const r = await autocannon({
      url: base,
      connections: 8,
      duration: 6,
      ...req,
    });
    const p95 = r.latency.p97_5 ?? r.latency.p99 ?? r.latency.max;
    const row = {
      endpoint: name,
      budgetP95ms: budget,
      p50ms: r.latency.p50,
      p95ms: p95,
      p99ms: r.latency.p99,
      rps: Math.round(r.requests.average),
      hardFail: badProbe + (r.errors ?? 0) + (r.timeouts ?? 0),
      ok: p95 <= budget && badProbe === 0 && (r.errors ?? 0) === 0 && (r.timeouts ?? 0) === 0,
    };
    results.push(row);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(
      pad('endpoint', 34),
      pad('p50', 7),
      pad('p95', 8),
      pad('budget', 8),
      pad('rps', 7),
      pad('errs', 6),
      'verdict',
    );
    for (const r of results) {
      console.log(
        pad(r.endpoint, 34),
        pad(r.p50ms + 'ms', 7),
        pad(r.p95ms + 'ms', 8),
        pad(r.budgetP95ms + 'ms', 8),
        pad(r.rps, 7),
        pad(r.hardFail, 6),
        r.ok ? 'PASS' : p95Line(r),
      );
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\nperf-smoke: ${failed.length} endpoint(s) over budget`);
    process.exit(1);
  }
  console.error('\nperf-smoke: all endpoints within budget');
}

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function p95Line(r) {
  return r.p95ms > r.budgetP95ms ? 'OVER BUDGET' : `${r.hardFail} FAILED REQUESTS`;
}

run().catch((e) => {
  console.error('perf-smoke failed:', e.message);
  process.exit(1);
});
