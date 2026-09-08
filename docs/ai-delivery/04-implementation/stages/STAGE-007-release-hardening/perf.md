# STAGE-007 — performance smoke

SRS-NFR performance budgets. **Indicative, not a production sign-off.** This host has ~1.9 GB
RAM and the API runs as a single `node` process (`@swc-node/register` on source, or
`node dist/main.js`); a real deployment runs multiple instances behind a balancer with managed
Postgres/Redis. The numbers below establish that the hot read paths have no accidental
O(n) blow-up or missing index, and that the app sustains a burst without errors.

## Harness

`node scripts/perf-smoke.mjs` (autocannon, 8 connections × 6 s per case) against a running API.
Each case: a 25-request `fetch` correctness pre-flight (every response must be 2xx — autocannon's
own status accounting is unreliable against a sub-10 ms keep-alive server on this box), then the
load run for latency + throughput. `verify:perf` boots the API, seeds dev, runs it, tears down.

## Result — 2026-09-07, carrental_dev (freshly seeded), single API process

| Endpoint                        | p50  | p95   | Budget p95 | req/s (1 proc) | errors | Verdict |
| ------------------------------- | ---- | ----- | ---------- | -------------- | ------ | ------- |
| `GET /health/ready`             | 2 ms | 9 ms  | 150 ms     | ~2 430         | 0      | PASS    |
| `GET /api/v1/meta/locales`      | 2 ms | 20 ms | 120 ms     | ~1 880         | 0      | PASS    |
| `POST /api/v1/discovery/search` | 2 ms | 7 ms  | 600 ms     | ~2 400         | 0      | PASS    |

`discovery/search` is the composite hot path — it fans out over units, blocks, holds,
confirmed reservations and operating hours per category, then prices a "from" figure. p95 7 ms
on a cold cache confirms the availability engine and its indexes are sound.

`/meta/locales`'s wider p95 (20 ms) is the DB-backed locale + translation read; it is cached
by ETag in real use (`If-None-Match` → 304) so the steady-state cost is lower than shown.

## Budgets (SRS-NFR, adjust per environment)

| Class                                  | p95 budget |
| -------------------------------------- | ---------- |
| health / liveness                      | 150 ms     |
| simple reads (meta, lookups, a detail) | 120–250 ms |
| composite read (search, quote)         | 600 ms     |
| write with a payment call (confirm)    | 2 000 ms   |

Confirm/assign/return were not load-tested here (they take a real payment-simulator round trip
and mutate state); their correctness + concurrency safety is covered by the API integration
suite (`booking`, `rental`, `discovery` specs — advisory locks, 23505 catch, partial unique
index). A production perf pass runs k6 against a staged deployment with those flows scripted.

## Follow-ups (not blocking this build)

- k6 scenarios for the write paths against a multi-instance staging deploy.
- Web bundle: `apps/web` ships one ~400 KB (gzip ~110 KB) JS chunk for both surfaces; splitting
  the ops surface out is a size win once APP-OPS grows further.
