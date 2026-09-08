# STAGE-010 — checkpoint

- **Status:** IN PROGRESS.
- **Resequencing note:** the per-page `/ops` string extraction is done **inside STAGE-012**
  (ops UX overhaul) — extracting strings while rewriting a screen is one pass, not two. The
  customer surface is extracted while it is rebuilt as `apps/site` (STAGE-011). STAGE-010 owns
  the gate, the shared chrome, the Languages admin, and the final `verify:i18n --strict`
  green-up.
- **Increment 1 (done, 2026-09-07):** the `verify:i18n` gate + Languages admin + launch-locale
  promotion.
- **Increment 2a (done, 2026-09-07):** the ops **shell** + dashboard + shared chrome +
  router + guards extracted to `en`/`ar`/`fr` (50 keys). Per-page `/ops` extraction → STAGE-012.
- **Increment 3 (STAGE-011):** the customer surface is rebuilt as `apps/site` i18n-complete
  from the start; validation-message map + email/notification localisation folded in there.

## Completed — increment 1

### `verify:i18n` gate — `scripts/verify-i18n.mjs`

- Loads every `packages/i18n/src/locales/<loc>/*.json`, flattens nested keys + namespaces the
  non-`common` files. `en` is the source of truth.
- For each active locale (`en`, `ar`, `fr` — DEC-024): fails on a **missing key**, an **empty
  value**, a **placeholder value** (`__MISSING__` / `TODO` / `TBD` / `FIXME`), or an **ICU
  placeholder mismatch** (`{n}` present in `en` but not the translation).
- `--strict` additionally greps `apps/web/src` (+ `apps/site` once it exists) for likely
  un-i18n'd JSX text / `aria-label` / `placeholder` / `title` and fails if any remain — the
  extraction-progress tracker for increments 2–3.
- Wired as `verify:i18n`; added to `verify:all` (with `verify:theme`).

### Launch locales — DEC-024

- `packages/i18n/src/config.ts` — `testOnly: false` for `en` / `ar` / `fr` (production launch
  locales, closes the DEC-020 open question). `system` seed `onConflictDoUpdate` now also
  writes `testOnly` so existing databases are corrected on re-seed. `meta.spec.ts` assertion
  flipped to `every(!testOnly)`.

### Languages admin — API

- `translation.service.ts` gains locale administration: `listLocales` (incl. inactive),
  `upsertLocale` (BCP-47 validation, starts **inactive**), `setLocaleActive`
  (default locale can't be deactivated), `setDefaultLocale` (transactional, one default).
  Each audits + invalidates the `i18n:locales` cache.
- `config.controller.ts` — `GET /api/v1/config/locales`, `POST /config/locales`,
  `POST /config/locales/:code/{activate,deactivate,default}` (`config.publish` for writes).
- `openapi.json` regenerated; `check:drift` OK.
- `apps/api/test/locale-admin.spec.ts` (4): launch locales are production; add → activate →
  visible in `GET /meta/locales`; malformed code 422 + non-publisher 403; default can't be
  deactivated (422 `is_default`).

### Languages admin — Web (`/ops/config/languages`)

- `surfaces/ops/languages-page.tsx` — configured-locale list (native/English name, `dir`,
  default/active badges, per-locale translation coverage %, links to the catalogue), and an
  "Add a language" form (code / names / direction). New `Languages` nav entry + route.
- `api-hooks.ts` — `useAdminLocales` / `useUpsertLocale` / `useLocaleAction`.
- `ops.languages.*` (18 keys) + `ops.branding.*` already in `en` / `ar` / `fr`.

## Verified — increment 1

`verify:static` PASS · `verify:i18n` OK (108 keys, en/ar/fr complete) · `verify:theme` PASS ·
`verify:unit` **72** · api: `locale-admin` **4**, `meta` 6, `config-lookup` 5, `branding` 6
(no regression) · `apps/web` build OK (432 KB / 119 KB gz).

## Not done yet

The bulk string extraction (increment 2): the ops shell nav labels, page headings, filter
`aria-label`s, `AppStateView` titles, table headers, form labels across `apps/web/src/surfaces/ops`
and the shared `apps/web/src/components`; then full `ar` + `fr`; `verify:i18n --strict` green
for `apps/web/src`. The customer surface is deferred to STAGE-011 (`apps/site`, built
i18n-complete). Zod/validation-message map + email templates → STAGE-011.

## Completed — increment 2a (shared chrome)

Extracted to full `en` / `ar` / `fr` (50 keys, ICU plurals for the location count):

- `ops-layout.tsx` — all 14 nav labels, the scope/console/locations header text, the skip link,
  `aria-label="Sections"`.
- `ops-dashboard.tsx` — heading, subtitle, "System health", checked-at, the four metric card
  labels, the "not available yet" text, the health-unreadable copy.
- `components/error-boundary.tsx` — the crash fallback (now a small `CrashView` function so it
  can use `useI18n` from the class boundary).
- `components/route-guards.tsx` — session-checking spinner, "staff only", "no access".
- `components/search-form.tsx` — field labels, the location placeholder, the two validation
  messages, the submit label (reuses `action.search`).
- `app/router.tsx` — the `NotFound` + `RouteError` copy (`useT`).

`verify:i18n` OK (158 keys, en/ar/fr complete). `verify:i18n --strict` remaining hits are all
in per-page `/ops` files (config-versions, reports, fleet, rate-plans, reservation-queue,
audit, translations) + the two customer auth pages — cleared in STAGE-012 / STAGE-011
respectively. `apps/web` build OK, web unit 2/2.
