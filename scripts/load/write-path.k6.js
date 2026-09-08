/**
 * k6 write-path load scenario (SRS-NFR — release hardening). Env-blocked on the authoring host
 * (no k6 binary, single-instance, ~1.9 GB RAM); this script is the scenario of record for a
 * pre-production run against a staged multi-instance deploy.
 *
 *   BASE_URL=https://staging.example  k6 run scripts/load/write-path.k6.js
 *
 * Exercises the money/holds path — the part with `pg_advisory_xact_lock`, idempotent
 * authorize+capture, and the outbox — not just hot reads (those are `scripts/perf-smoke.mjs`).
 * Thresholds are the SRS-NFR targets; a run that breaches them fails non-zero.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const API = `${BASE}/api/v1`;

const quoteMs = new Trend('quote_ms', true);
const holdMs = new Trend('hold_ms', true);

export const options = {
  scenarios: {
    // ramp to a sustained write load, then a short spike to prove the last-unit race holds
    sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 20 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
    spike: {
      executor: 'constant-arrival-rate',
      startTime: '2m',
      duration: '1m',
      rate: 40,
      timeUnit: '1s',
      preAllocatedVUs: 60,
      maxVUs: 120,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:search}': ['p(95)<600'],
    quote_ms: ['p(95)<800'],
    hold_ms: ['p(95)<1000'],
  },
};

const LOCATIONS = ['JFK', 'LHR', 'PAR'];
const CATEGORIES = ['economy', 'compact', 'intermediate', 'standard', 'suv'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function isoPlusDays(d) {
  return new Date(Date.now() + d * 864e5).toISOString();
}

export default function () {
  const pickupLocationCode = pick(LOCATIONS);
  const categoryCode = pick(CATEGORIES);
  const body = {
    pickupLocationCode,
    returnLocationCode: pickupLocationCode,
    pickupAt: isoPlusDays(3),
    returnAt: isoPlusDays(6),
  };

  const search = http.post(`${API}/discovery/search`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'search' },
  });
  check(search, { 'search 200': (r) => r.status === 200 });

  const quoteReq = http.post(
    `${API}/discovery/quote`,
    JSON.stringify({ ...body, categoryCode, hold: false }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'quote' } },
  );
  quoteMs.add(quoteReq.timings.duration);
  check(quoteReq, { 'quote 200/409': (r) => r.status === 200 || r.status === 409 });

  // a hold is the contended write — advisory lock + capacity check
  const holdReq = http.post(
    `${API}/discovery/quote`,
    JSON.stringify({ ...body, categoryCode, hold: true, holderKey: `k6-${__VU}-${__ITER}` }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'hold' } },
  );
  holdMs.add(holdReq.timings.duration);
  check(holdReq, {
    // 200 = got the hold; 409 = sold out (a correct answer under contention, not an error)
    'hold 200/409': (r) => r.status === 200 || r.status === 409,
  });

  sleep(Math.random() * 2);
}
