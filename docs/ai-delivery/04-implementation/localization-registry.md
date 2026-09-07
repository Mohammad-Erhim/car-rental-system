# Localization Registry

Tracks approved locales, default/fallback, resource locations, content/lookup/template
ownership, RTL/LTR direction, locale-sensitive formatting, coverage status, missing keys,
screenshots, and tests per surface (SRS §21.2, SRS-I18N-001..010, FR-GBL-002/003).

## Locale profile (development/test — DEC-020)

| Locale | Role                              | Direction | Status              |
| ------ | --------------------------------- | --------- | ------------------- |
| `en`   | Configured default (test)         | LTR       | PLANNED (STAGE-001) |
| `fr`   | Approved second LTR locale (test) | LTR       | PLANNED (STAGE-001) |
| `ar`   | RTL coverage locale (test)        | RTL       | PLANNED (STAGE-001) |

Fallback chain: `fr → en`, `ar → en`. Missing mandatory legal/financial content blocks the
affected publication/use (SRS-I18N-005). **Real launch locale list is unconfirmed business
configuration — must be confirmed before any production release (BR-028).**

## Resource layout

- UI keys: `packages/i18n/src/locales/{en,fr,ar}/*.json` (namespaced by surface/feature).
- API structured error codes + params: language-neutral; client resolves messages.
- Server-rendered outputs (email, receipt, agreement, export): resolved server-side from the
  recipient/document locale (SRS-I18N-004); templates versioned in `config` module.
- Lookup labels / catalogue content / policy text: `DAT-TRANSLATION` rows, workflow via
  SCREEN-OPS-034.

## Coverage status by surface

| Surface            | Key completeness | Fallback tested | RTL screenshot set | Status      |
| ------------------ | ---------------- | --------------- | ------------------ | ----------- |
| APP-CWEB           | —                | —               | —                  | NOT_STARTED |
| APP-OPS            | —                | —               | —                  | NOT_STARTED |
| Emails / documents | —                | —               | —                  | NOT_STARTED |

## Locale-sensitive behaviour checklist (per SRS-I18N-007)

dates · times · time zones (IANA, DST) · numbers · decimal separators · currency (transaction
currency immutable) · units · plurals · names · addresses · phone numbers · Unicode
search/sort · bidi isolation for VIN/plate/reference/email/URL/phone.
