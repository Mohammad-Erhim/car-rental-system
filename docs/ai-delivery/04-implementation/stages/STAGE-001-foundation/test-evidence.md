# STAGE-001 — test evidence

Stage: **Shared identity, config, reference data, UI foundation.**
Date: 2026-09-07. Branch `implementation`.

## Verification gates (all green)

| Gate              | Command               | Result                                                                                                                        |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Static            | `pnpm verify:static`  | PASS — `build:packages`, `-r lint`, `-r typecheck`, `format:check` (all files), `openapi:generate`, `contracts check:drift`   |
| Unit              | `pnpm verify:unit`    | PASS — 27 tests (contracts 4, i18n 11, api 6, ui 4, web 2)                                                                    |
| API integration   | `pnpm verify:api`     | PASS — 24 tests (`iam` 9, `config-lookup` 5, `migrate` 4, `meta` 6). Each file rebuilds `carrental_test` (drop→migrate→seed). |
| Migration         | `pnpm verify:migrate` | PASS — 4 tests, empty→current proven on a disposable DB                                                                       |
| E2E (3 viewports) | `pnpm verify:e2e`     | PASS — **42 tests** (14 × phone 390 / tablet 820 / laptop 1440), 0 console errors, 0 unexpected failed requests               |

## API integration tests (`apps/api/test`)

### `iam.spec.ts` (9)

- TEST-IAM-001/002 register → verify email (dev code) → active session; account moves `pending`→`active`.
- TEST-IAM-001 duplicate registration → `business_rule_violation` (`reason=account_exists`), no second account row.
- TEST-IAM-003 sign-in: wrong password → neutral `401` (same body as unknown email); correct → session.
- TEST-IAM-003 staff audience: a customer credential cannot obtain a `staff` session.
- TEST-IAM-003 refresh rotates the opaque refresh token; replaying the old token → family revoked (reuse detection).
- TEST-IAM-004 recovery: neutral response for unknown email; code is single-use; completing it revokes all sessions + emits `security_alert`.
- TEST-IAM-006 profile: optimistic concurrency — stale `version` on update → `409` with `currentVersion`.
- TEST-IAM-008 closure request is created `blocked` with a `retention_period` blocker (not silently failed).
- Permission denial: unauthenticated → `401` on a protected route; a customer hitting a staff route → `403`.

### `config-lookup.spec.ts` (5)

- TEST-LKP-001 dynamic retrieval: values come from DB with stable `code` separate from localized `label`; locale fallback applied.
- TEST-LKP-005 a `system_fixed` type rejects value mutation (`forbidden`, `reason=read_only`).
- TEST-LKP-004/009/011 create value → appears in the selector API → edit label → deactivate → still resolvable for history; ETag `W/"lkp-<type>-<version>"` bumps each mutation; `lookup.invalidated` outbox row written.
- TEST-LKP-012 lookup integrity check surfaces in `/health/ready` (no drift against required closed code sets).
- TEST-I18N translation publish blocks while a mandatory `legal.*` key is untranslated (`business_rule_violation`, `reason=missing_mandatory`).

## E2E — `e2e/tests` (42 = 14 × 3 viewports)

| Spec                         | Test                                                                                                                                          | Source IDs                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `smoke.spec.ts`              | customer home renders + API-backed locales + locale switch → RTL                                                                              | SCREEN-CUS-001 (foundation), SRS-I18N    |
| `smoke.spec.ts`              | unknown route → recoverable `no-results` state                                                                                                | SRS-UI-007                               |
| `smoke.spec.ts`              | anonymous `/ops` → `/ops/sign-in`                                                                                                             | SRS-SEC, FLOW-OPS-014                    |
| `smoke.spec.ts`              | after staff sign-in the dashboard shows health drill + labelled unavailable metrics                                                           | SCREEN-OPS-002 (foundation)              |
| `auth-and-reference.spec.ts` | FLOW-CUS-002: protected route → sign-in with return-to → back to origin                                                                       | FLOW-CUS-002, SCREEN-CUS-008             |
| `auth-and-reference.spec.ts` | SCREEN-CUS-012: change language → persists on the account + re-renders the running app; survives reload; restored                             | SCREEN-CUS-012, FR-IAM-006, SRS-I18N-009 |
| `auth-and-reference.spec.ts` | SCREEN-OPS-001 + 031: admin edits a `cancel_reason` label → the customer-facing selector API returns the new label with no redeploy           | SCREEN-OPS-001/030/031, FR-GBL-004       |
| `auth-and-reference.spec.ts` | permission gate: an agent has no "Staff & roles" nav item and direct nav shows `permission-denied` (no data leak)                             | FR-ADM-009, SRS-SEC, design §3.1         |
| `account-and-i18n.spec.ts`   | SCREEN-CUS-013: add a saved driver → appears → remove via confirm                                                                             | SCREEN-CUS-013, FR-IAM-007               |
| `account-and-i18n.spec.ts`   | SCREEN-CUS-024: a closure request is accepted and shows its retention blocker; can be cancelled                                               | SCREEN-CUS-024, FR-IAM-008               |
| `account-and-i18n.spec.ts`   | SCREEN-OPS-034: coverage by language + namespace renders; a string can be edited → "in review"                                                | SCREEN-OPS-034, FR-ADM-012               |
| `responsive.spec.ts`         | customer surfaces (`/`, `/sign-in`, `/register`, `/recovery`) — no horizontal page overflow; bottom-nav on phone/tablet, header-nav on laptop | design §2.4                              |
| `responsive.spec.ts`         | operations surfaces (`/ops`, `/ops/config/reference-data`, `/ops/admin/staff`) — no horizontal page overflow                                  | design §2.4                              |
| `rtl.spec.ts`                | customer sign-in + ops reference-data render right-to-left in Arabic, no overflow                                                             | SRS-I18N-006/009                         |

## Screenshots — `stages/STAGE-001-foundation/screenshots/` (45 files)

15 scenarios × 3 viewports (`.phone` 390 / `.tablet` 820 / `.laptop` 1440):
`cweb-signin`, `cweb-profile`, `cweb-drivers`, `cweb-data-requests`, `cweb-home-default`,
`cweb-home-rtl`, `ops-signin`, `ops-dashboard-default`, `ops-dashboard-authed`,
`ops-reference-data`, `ops-translations`, `responsive-cweb-home`, `responsive-ops-dashboard`,
`rtl-cweb-signin`, `rtl-ops-reference-data`.

### Screenshot analysis

- **Responsive**: content columns use `mx-auto max-w-*` and `sm:`/`lg:` grid breakpoints; forms
  and cards are single-column and legible at 390px. The customer top nav moves to a bottom tab
  bar below `lg` (was `md` — at 820px the header could not fit the wordmark + 3 text items +
  status + language + auth button without wrapping; see D-001-6). The ops section nav is a
  horizontal `overflow-x-auto` strip below `lg` and a fixed sidebar at `lg`. Wide tables
  (reference-data values, translation coverage, staff) scroll inside their own
  `overflow-x-auto` box; the reference-data two-pane grid carries `[&>*]:min-w-0` so the table
  cannot force the page wider (see D-001-7). `responsive.spec.ts` asserts
  `documentElement.scrollWidth ≤ clientWidth` on every listed surface at all three viewports.
- **RTL**: `dir="rtl"` on `<html>`, mirrored layout, logical properties (`ps-`/`pe-`/`ms-`/`me-`,
  `text-start`) so padding/alignment flip; the language name (not a flag) labels the switcher.
  No horizontal overflow in Arabic.
- **States**: loading / empty / failure / stale / permission-denied all render via `AppStateView`
  with `data-appstate` locators; no raw i18n keys shown; the sign-in/refresh `401` and
  verify `422` negatives are expected and allow-listed in the console guard.

## Logs / DB / network checks

- API logs (Playwright `[WebServer]`): Pino JSON, one line per request with `requestId`/`traceId`;
  no unredacted secrets; no `error`-level lines on the healthy journeys.
- `/health/ready` → `200` with `db`, `redis`, `migrations`, `lookups` all `ok` (ops dashboard
  health drill asserts `db`/`lookups` = `ok`).
- DB after the run: `carrental_dev` demo customer restored to `localeCode='en'` by the E2E
  cleanup steps; `carrental_test` is rebuilt per API-test file.
- Network: the console guard records any `status >= 400` that is not an allow-listed expected
  negative; all 42 E2E tests end with `guards.assertClean()` (0 unexpected).
