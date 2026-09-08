# Release readiness — Car Rental System

Scope: **full system minus the APP-CMOB (mobile) frontend**. The mobile app's REST/OpenAPI
contract IS built and served by this API. Date: 2026-09-07. Branch `implementation`.

## Gate summary

| Gate                      | Command                  | Result                                                                                                                            |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Static                    | `pnpm verify:static`     | PASS — lint + typecheck + prettier + `openapi:generate` (87 paths) + contract drift                                               |
| Unit                      | `pnpm verify:unit`       | PASS — 63 (contracts 4, i18n 11, api 42, ui 4, web 2)                                                                             |
| API integration           | `pnpm verify:api`        | PASS — 68 (security 13, report 7, reservation-ops 6, booking 7, iam 9, rental 4, discovery 7, config-lookup 5, migrate 4, meta 6) |
| Migration (empty→head)    | `pnpm verify:migrate`    | PASS — 4; head `0006`                                                                                                             |
| E2E (phone/tablet/laptop) | `pnpm verify:e2e`        | PASS — see `test-evidence.md` (responsive, RTL, a11y, full-sweep + every feature spec)                                            |
| Accessibility             | `pnpm verify:a11y`       | PASS — 0 serious/critical axe violations on the critical customer + ops screens                                                   |
| Security                  | `pnpm verify:security`   | PASS — TEST-SEC-003/007/008/010/011/015/016/017 (13); auth abuse, CORS, CSRF, authz sweep, scope isolation, injection, redaction  |
| Performance (indicative)  | `pnpm verify:perf`       | PASS — hot reads p95 ≤ 40 ms single-process, 0 errors (`perf.md`)                                                                 |
| Backup / restore          | manual rehearsal         | PASS — dump → restore → API boots → `/health/ready = ok` (`backup-restore.md`)                                                    |
| Secret scan               | `pnpm check:secrets`     | PASS — no committed secrets; `.env.example` placeholders only                                                                     |
| Deploy artifacts          | authored + build-checked | Dockerfiles, compose, nginx, RUNBOOK; `apps/api` `tsc → dist` produces every container entrypoint                                 |

## SRS-SEC coverage (TEST-SEC-001..017)

| Req     | Where verified                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | argon2id + pepper + rehash-on-policy-change — `iam.spec.ts` (sign-in), `password.service`                                                                                                           |
| SEC-002 | short-lived HS256 access JWT; opaque hashed **rotated** refresh + reuse detection + family revoke — `iam.spec.ts` TEST-IAM-003                                                                      |
| SEC-003 | refresh cookie `HttpOnly; SameSite=Lax; Path=/api/v1/auth; Secure(prod)`; CSRF origin/double-submit on cookie-authed writes — `security.spec.ts` TEST-SEC-003                                       |
| SEC-004 | verification/recovery tokens single-use, expiring, rate-controlled, hashed, neutral responses — `iam.spec.ts` TEST-IAM-004                                                                          |
| SEC-005 | `change-password` clears the session; step-up policy hooks present (full step-up UI = follow-up)                                                                                                    |
| SEC-006 | OAuth/OIDC — not in approved scope (no provider configured); `IDENTITY_DRIVER=simulator`                                                                                                            |
| SEC-007 | server-side subject/action/resource/scope checks; client hiding is cosmetic — `security.spec.ts` vertical sweep (anon 401, wrong-perm 403 on every ops admin route), `auth-and-reference.spec.ts`   |
| SEC-008 | repository reads carry an auth-derived scope; report rows filtered by `actor.locationScope` at query time; a param cannot widen it — `security.spec.ts` TEST-SEC-008, `report.spec.ts` TEST-RPT-001 |
| SEC-009 | permission changes apply on the next request (`AuthGuard` resolves per-request); removing a case owner → the case stays owned/visible                                                               |
| SEC-010 | requester ≠ approver for config publication; no self-approve — `security.spec.ts` TEST-SEC-010, `report.spec.ts` TEST-ADM-001                                                                       |
| SEC-011 | all input Zod-validated; ORM bindings only (no string SQL with user input); unknown body fields stripped; malformed JSON → 4xx — `security.spec.ts` TEST-SEC-011                                    |
| SEC-012 | backups are checksummed custom-format archives; restore rehearsed; DB/Redis not internet-exposed (compose + RUNBOOK) — `backup-restore.md`                                                          |
| SEC-013 | secret scan gate; `.env.example` placeholders; no secrets in logs/fixtures/screenshots — `check:secrets`                                                                                            |
| SEC-014 | no card data stored — `PaymentPort` returns opaque tokens + brand/last4; simulator takes synthetic tokens — `booking.spec.ts`                                                                       |
| SEC-015 | helmet headers, CORS allowlist (no reflection of a foreign origin), request-size limit, **auth rate limiter** — `security.spec.ts` TEST-SEC-015                                                     |
| SEC-016 | audit covers auth risk, access change, config publication, money actions, vehicle custody — `security.spec.ts` TEST-SEC-016, `report.spec.ts` TEST-ADM-004                                          |
| SEC-017 | Problem envelope carries no stack/SQL/credentials; log redaction of tokens/cookies/PII — `security.spec.ts` TEST-SEC-017, `observability/logger.ts`                                                 |

**Substitutions on this host:** no OWASP ZAP / Semgrep binary and no Docker. The adversarial
checks above are implemented as integration tests instead; `pnpm audit` is the dependency scan.
A pre-production run should add a ZAP baseline against a staged deploy and a SAST pass.

## Deferred items (explicit, not dropped)

Carried forward from STAGE-005/006 and recorded here as scoped deferrals — none affect a core
invariant, an authz boundary, or a money path:

| Item                                                            | From      | Why deferred / where it lands                                           |
| --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| Incident / roadside + replacement vehicle flow                  | STAGE-005 | Additive rental sub-flow; `rental.service` has the seam                 |
| Vehicle transfers between locations                             | STAGE-005 | `vehicle_block` + a transfer state; no invariant at risk                |
| Maintenance workflow UI (`vehicle_block` exists)                | STAGE-005 | Ops screen only; blocks already reduce availability                     |
| Fleet import/export wizard (SCREEN-OPS-017..020)                | STAGE-005 | Bulk-entry convenience; per-row validation designed                     |
| Post-rental tolls / fines / lost-property                       | STAGE-005 | Adjustment lines on a closed rental                                     |
| `case` **retry** action (re-emit outbox / re-run reconcile)     | STAGE-006 | List + resolve exist; retry is one handler                              |
| Data-quality runner + SCREEN-OPS-039 panel                      | STAGE-006 | Lookup drift already in `/health/ready`; add orphan/ref checks          |
| `pricing` / `product` / `location` config **kinds**             | STAGE-006 | Versioning engine is kind-agnostic; only `policy` has a validator wired |
| Scheduled-report recipient re-authorization at send time        | STAGE-006 | No scheduler process here; `report_schedule.lastSkipReason` is in place |
| Report parameter forms (date ranges) + per-column CSV selection | STAGE-006 | Reports run with default params today                                   |
| k6 write-path load, ZAP baseline, SAST, web bundle split        | STAGE-007 | Need a staged multi-instance deploy + the tools                         |
| Firefox / WebKit E2E                                            | STAGE-002 | Only Chromium installs on this host                                     |
| Full step-up-auth UI (SEC-005)                                  | STAGE-001 | Policy hooks + `lastFullAuthAt` exist; the challenge UX is the gap      |

## Verdict

**Ready for a staging deploy of the approved scope.** All release gates that are runnable on
this host pass. The deferred list is bounded, reasoned, and free of correctness/security
blockers. Pre-production: run the tool-based security scans and the k6 write-path load against
a staged multi-instance environment, and add Firefox/WebKit to the E2E matrix.
