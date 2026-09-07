# Localization Registry

Tracks approved locales, default/fallback, resource locations, content/lookup/template
ownership, RTL/LTR direction, locale-sensitive formatting, coverage status, missing keys,
screenshots, and tests per surface (SRS §21.2, SRS-I18N-001..010, FR-GBL-002/003).

## Locale profile (development/test — DEC-020)

| Locale | Role                              | Direction | Status                                                                                                                   |
| ------ | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `en`   | Configured default (test)         | LTR       | ACTIVE — `locale` row active, `common` bundle complete, default + fallback target                                        |
| `fr`   | Approved second LTR locale (test) | LTR       | ACTIVE — `common` bundle complete; `fr→en` fallback tested; app re-renders on switch (SCREEN-CUS-012)                    |
| `ar`   | RTL coverage locale (test)        | RTL       | ACTIVE — `common` bundle complete; `ar→en` fallback; `dir=rtl` + mirrored layout verified (`rtl.spec.ts`), no h-overflow |

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

| Surface            | Key completeness                                                                            | Fallback tested        | RTL screenshot set                     | Status                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| APP-CWEB           | `common` namespace 100% en/fr/ar; screen-specific copy still English-only (labels/headings) | yes (`fr→en`, `ar→en`) | `cweb-home-rtl.*`, `rtl-cweb-signin.*` | IN_PROGRESS — shell/nav/state text localized + switcher + persist; screen copy 006 |
| APP-OPS            | `common` namespace 100%; screen copy English-only; lookup labels via translation catalogue  | yes                    | `rtl-ops-reference-data.*`             | IN_PROGRESS — chrome localized; reference-data + translations screens verified RTL |
| Emails / documents | verification / recovery / security_alert templates published en/fr/ar                       | n/a (locale-selected)  | —                                      | IN_PROGRESS — 3 IAM templates done; receipts/agreements/exports 003/005/006        |

Translation catalogue (SCREEN-OPS-034): `GET /config/translations/completeness` (locale ×
namespace coverage %), per-key `list` with `outdated` flag, `upsert` (draft/in_review/published),
`publish` blocked while any `legal.*` key is untranslated (`business_rule_violation`,
`reason=missing_mandatory`) — tested `config-lookup.spec.ts` TEST-I18N + `account-and-i18n.spec.ts`.

## Locale-sensitive behaviour checklist (per SRS-I18N-007)

dates · times · time zones (IANA, DST) · numbers · decimal separators · currency (transaction
currency immutable) · units · plurals · names · addresses · phone numbers · Unicode
search/sort · bidi isolation for VIN/plate/reference/email/URL/phone.
