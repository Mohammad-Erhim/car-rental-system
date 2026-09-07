# STAGE-010 — Internationalization completion · plan

## Objective / outcome

Every page, component, field, label, message, validation, option, and UI element in **both**
frontends is localized. Switching language never produces a partially-translated or
mixed-direction screen. `en`, `ar`, `fr` ship complete; more locales can be added and
translated from the dashboard with no code change.

## Source IDs

Mandate §1.4 (enhancement-program.md); DEC-024; SRS-I18N-001..009, FR-GBL-002/003/004/005,
SRS §9.2 (DAT-TRANSLATION), SRS §21.1 (SRC-LANGUAGE-LOCALE), BR-028.

## Workstreams

### 1. `packages/i18n` hardening

- Framework-agnostic core + `/react` + new `/next` bindings (server + client, RSC-safe).
- Namespaces per feature area (`common`, `home`, `search`, `vehicle`, `checkout`, `account`,
  `trips`, `auth`, `ops.*`, `errors`, `validation`, `enums`, `email`). ICU throughout.
- `sourceRevision` wired so an edited English source flags stale `ar`/`fr` in the completeness
  report.

### 2. String extraction

- Scripted sweep of `apps/web` + `apps/site` for literal UI strings → namespaced keys +
  `t('ns.key')`; ESLint `i18n/no-literal-string` (JSX text, `aria-label`, `placeholder`,
  `title`, `alt`) with a narrow allowlist. Target: **0** unexplained literals.
- Zod schemas: centralised message map so validation errors are keys, not English.
- Enum / option / lookup labels: already locale-aware via the lookup catalogue — audit every
  `<Select>`/radio/badge to use it; no client-side English enum text.
- Email/notification templates: localized bodies via the translation catalogue + template
  namespace; fall back per `fallbackChain`.

### 3. Full `en` / `ar` / `fr`

- Author every key in all three. `ar` = Modern Standard Arabic + **RTL**: logical CSS
  properties everywhere (`ms-`/`me-`, `start`/`end`), `dir` on `<html>`, mirrored icons where
  directional, `.bidi-isolate` for codes/plates/phones/VIN, number/date/currency via
  `Intl`/formatters, correct plural categories.
- `fr` LTR second locale; typographic spacing rules via formatters.

### 4. `apps/site` locale routing

- `/[locale]/…` segments, `generateStaticParams` for active locales, `<html lang dir>` per
  locale, `Accept-Language` negotiation + cookie on first hit, locale switch preserves the path
  - query + scroll (SRS-I18N-009).

### 5. Dashboard — Languages admin (`/ops/config/languages`)

- List/add/activate/deactivate/reorder a locale (writes the `locale` table via a
  `configVersion` of kind `locale`); set default; RTL flag; fallback chain editor.
- Per-namespace **completeness matrix** (existing `…/completeness`) with drill-in inline
  editing, missing/stale filters, machine-translate-draft stub, CSV/JSON import + export,
  publish-per-namespace.
- Non-technical: adding "German" + filling the grid + publishing makes `/de/` live with no
  deploy.

### 6. `verify:i18n` gate

- Fails on any missing/empty/`__MISSING__`/placeholder key for an **active** locale in either
  app's built bundle; fails on `i18n/no-literal-string` violations; checks ICU parses and
  placeholder sets match across locales.

## Acceptance criteria

- Every route in both apps rendered in `en`/`ar`/`fr` shows **no** English fallback text when
  the locale is complete (fallback badge only where `isFallbackAccepted`).
- `ar` renders fully RTL with no clipped/overlapping/LTR-leaking layout (spot + `verify:e2e`).
- Validation errors, select options, badges, toasts, empty/error states, emails — all localized.
- Adding a locale + translations from the dashboard needs no code change (demoed with a 4th
  locale in `test-evidence.md`, then removed).
- `verify:i18n` green; `verify:static | unit | api | migrate` green.

## Test evidence (→ `test-evidence.md`)

`verify:i18n` output; completeness matrix screenshots (100% for en/ar/fr); per-locale
screenshots of 6 representative screens per app; the "add a 4th locale from the UI" walkthrough;
`translation-admin.spec.ts`.
