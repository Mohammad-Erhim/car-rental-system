# Traceability Matrix

Two-way trace: source ID ⇄ implementation ⇄ evidence. `COMPLETED` requires passing evidence,
not only a code path.

Status: `NOT_STARTED` · `IN_PROGRESS` · `IMPLEMENTED` (code exists, not fully verified) ·
`COMPLETED` (passing evidence) · `DEFERRED` (out of approved scope).

## Applications

| Source ID | Type | Stage   | Code / Config / Migration               | Test IDs / Files  | Screenshot / Evidence         | Status                                        |
| --------- | ---- | ------- | --------------------------------------- | ----------------- | ----------------------------- | --------------------------------------------- |
| APP-CWEB  | App  | 000–007 | `apps/web` route tree `/`               | `e2e/tests/smoke.spec.ts` (+ per-stage) | `stages/*/screenshots/cweb-*` | IN_PROGRESS (shell + home foundation verified) |
| APP-OPS   | App  | 000–007 | `apps/web` route tree `/ops`            | `e2e/tests/smoke.spec.ts` (+ per-stage) | `stages/*/screenshots/ops-*`  | IN_PROGRESS (shell + dashboard foundation verified) |
| APP-CMOB  | App  | —       | REST contract only (`apps/api` OpenAPI) | —                 | —                             | DEFERRED (frontend); API contract IMPLEMENTED |

## Functional requirements (FR-\*)

_Rows added per stage. See `implementation-roadmap.md` for the FR set owned by each stage._

| Source ID                       | Type | Stage | Code / Config / Migration | Test IDs / Files | Evidence | Status |
| ------------------------------- | ---- | ----- | ------------------------- | ---------------- | -------- | ------ |
| _(populated during STAGE-001+)_ |      |       |                           |                  |          |        |

## SRS cross-cutting families

| Source ID         | Stage       | Implementation                                                  | Evidence                    | Status      |
| ----------------- | ----------- | --------------------------------------------------------------- | --------------------------- | ----------- |
| SRS-ARC-001..008  | 000         | modular monolith; `apiModuleBoundaries` dependency-boundary lint; ports pattern established | `verify:static` PASS | PARTIAL (enforced fully once ≥2 modules) |
| SRS-API-001..010  | 000–003     | `/api/v1` URI versioning, generated `openapi.json` (committed), Problem envelope + stable error codes, `Idempotency-Key`/`If-Match` client + pipe scaffold, cursor pagination | `apps/api/test/meta.spec.ts`, `check:drift` PASS | PARTIAL (auth/idempotency enforcement in 001–003) |
| SRS-DAT-001..012  | 000–005     | Drizzle schema (32 tables), migration `0000` empty→current proof, money = integer minor units, outbox/idempotency/audit tables, seed `system/dev/test`, `_dev/_test` reset guard | `test/migrate.spec.ts` PASS (4) | PARTIAL (write paths + invariants in 001+) |
| SRS-SEC-001..017  | 001,007     | helmet, CORS allowlist, cookie-parser, redaction layer (logger), secret-scan gate; argon2id + JWT + refresh rotation + RBAC land in 001 | `scripts/check-env.sh` PASS; `apps/api/test/security/**` (001) | PARTIAL |
| SRS-I18N-001..010 | 000,001,006,007 | locale config + ICU translator + `Intl` formatters + fallback + RTL; `meta/locales` DB-backed; 1 RTL screenshot set | `packages/i18n` 11 tests PASS; `cweb-home-rtl.*` | PARTIAL (translation catalogue workflow in 001/006) |
| SRS-LKP-001..015  | 000,001,006 | `lookup_type`/`lookup_value` model, `system_fixed`/`configurable`/`external` classes seeded, `/health/ready` integrity check (SRS-LKP-012) | `test/meta.spec.ts` (lookups check) PASS | PARTIAL (dynamic selector API + management in 001) |
| SRS-OBS-001..012  | 000,007     | Pino JSON + redaction, correlation ALS (trace/request id), `/health/live|ready|version`, `/metrics` (route-template labels), evidence guards in E2E | `test/meta.spec.ts`, E2E `[WebServer]` logs | COMPLETED (baseline); full evidence-bundle in 007 |
| SRS-UI-001..015   | 000–007     | `AppStateView` (12 STATE-* + `data-appstate` locators), shadcn primitives, theme + direction, skip links, focus-visible; shared `COMP-SH-*` set builds out 001+ | `packages/ui` 4 tests, `e2e/tests/smoke.spec.ts` 12 PASS | PARTIAL |
| SRS-NFR-001..022  | 007         | budgets, a11y, scale, restore                                   | `stages/STAGE-007-*/**`     | NOT_STARTED |

## Screens / Flows / Components / Elements / Lookups

_Populated per stage from SRS §20–21. Each SCREEN row records: route, states implemented,
screenshot set (phone/tablet/laptop [+RTL]), and the owning TEST-SCREEN-* / TEST-FLOW-*._
