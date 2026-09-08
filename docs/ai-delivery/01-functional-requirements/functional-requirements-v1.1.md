# Car Rental System — Functional Requirements v1.1 (Enhancement-Program Amendment)

## 1. Document Information

| Field | Value |
| --- | --- |
| Document | Functional Requirements — Amendment v1.1 |
| Project | Car Rental System |
| Version | 1.1 (amends v1.0; does not supersede it) |
| Status | Proposed — pending Stage-gate acceptance (see `00-control/changes/CR-20260907-001`) |
| Baseline date | 2026-09-08 |
| Base document | `functional-requirements-v1.0.md` (unchanged; all v1.0 IDs remain stable) |
| Change record | `CR-20260907-001` — Propagate Enhancement Program scope into FR / UI-UX / SRS |
| Decisions incorporated | DEC-021 … DEC-026 (see `04-implementation/`) |

### 1.1 Nature of this amendment

This amendment documents capability that is **implemented, committed, and tested** on branch
`implementation` but was not described in FR v1.0. It adds new stable IDs (areas **FR-BRD**,
**FR-SEO**) and resolves configuration decisions v1.0 deferred. It renumbers and reinterprets
**nothing** in v1.0. Where the enhancement program merely *implemented* an FR that v1.0 already
specified, that is recorded in §A (delivery status), not as a new requirement.

No behaviour change is authorised by this amendment; it transcribes the system that exists.

---

## 2. Amendments to v1.0 sections

### 2.1 §2 Purpose and Scope — surface split (DEC-023)

The single customer/ops React SPA is replaced by two surfaces sharing one design system,
one API, and one origin in production:

- **APP-CWEB** — the customer site, rebuilt on **Next.js (App Router)** as `apps/site`:
  server-rendered, statically generated where possible, `/[locale]/…` routing, full technical
  SEO. Hosts discovery, vehicle detail, checkout, auth, account, trips, help, legal.
- **APP-OPS** — the operations & administration dashboard, `apps/web` (Vite SPA), served under
  `/ops`. Hosts every staff screen.
- **APP-CMOB** — the React Native customer app remains in scope per v1.0 but is built and
  released separately; this amendment does not change its functional scope.

In production a single edge proxy presents one origin: `/` → APP-CWEB, `/ops` → APP-OPS,
`/api` → the API (DEC-021 / DEC-026). This is a delivery-topology fact; it creates no new
user-visible functional requirement beyond "the customer never sees more than one site".

### 2.2 §7 FR-GBL-002 / FR-GBL-003 — launch languages resolved (DEC-024)

v1.0 §14(2) deferred "launch languages, default/fallback language, RTL languages". Resolved:

- Launch locales are **English (en, default), Arabic (ar), French (fr)**, each fully translated
  and QA'd across every page, state, theme, and viewport.
- **ar** drives full right-to-left layout (`<html dir="rtl">`, logical CSS properties,
  bidi-isolation of codes/identifiers).
- The locale set stays **dynamically manageable** (FR-GBL-004 / FR-ADM-012): a dashboard
  Languages admin can add, activate/deactivate, reorder, and mark a locale default without a
  deploy; translation catalogues are draft→review→publish and a mandatory legal string blocks
  publish while untranslated.
- A changing language never yields a partially translated or mixed-direction screen — verified
  by `verify:i18n` (every active locale has every base key with matching ICU placeholders) and
  `verify:i18n --strict` (no un-i18n'd literal in either front end).

### 2.3 §14 Configuration decisions now confirmed

| v1.0 §14 item | Resolution |
| --- | --- |
| 2 — languages / RTL | en + ar + fr, en default, ar RTL (DEC-024). |
| 8 — incident / replacement / lost-property procedures | Incident + replacement-vehicle flow implemented (FR-RNT-010); tolls/fines/lost-property (FR-RNT-016) remain configuration + a later increment. |
| 12 — scheduled-delivery policy | Recurring report delivery re-authorises the schedule owner at send time; an owner who has lost `report.export` or been off-boarded pauses the schedule with a recorded reason (FR-RPT-006). |

---

## 3. New functional area: FR-BRD — Branding and theming (DEC-025)

### FR-BRD-001 — Curated brand configuration

Authorised staff (`config.publish`) must be able to set the brand's **primary, accent, and
semantic colours** (success / warning / destructive / info), **corner radius**, **density**
(comfortable / compact), and **typeface** from a curated set. The system must reject a colour
pair that fails WCAG AA contrast in either light or dark mode before the change can be drafted.
Arbitrary CSS is not accepted.
- Related: FR-GBL-007, FR-ADM-005, FR-BRD-003

### FR-BRD-002 — Brand assets

Staff must be able to upload a **logo**, **favicon**, and **social-share (OG) image**. The
system must validate each upload by content (not extension), enforce per-purpose size and
pixel bounds, sanitise SVG (no script, no external references), and store it so it can be
served through a signed, time-limited URL. A rejected asset must say why.
- Related: FR-BRD-001, FR-INT-002, FR-GBL-008

### FR-BRD-003 — Versioned, no-deploy application

A branding change must go through the same **draft → submit → approve/reject → publish**
workflow as any other configuration (FR-ADM-005/006), including separation of duties. On
publish it must take effect on **both** front ends with no redeploy: the customer site inlines
the resolved tokens at build/revalidate time (no flash of unstyled content, SEO-safe); the
dashboard applies them before first paint. Light and dark are two token maps in one version.
- Related: FR-ADM-005, FR-ADM-006, FR-BRD-001

### FR-BRD-004 — Light / dark / system

Every screen on both surfaces must render correctly in light mode, dark mode, and "match the
device", with a visible per-user toggle whose choice persists. Brand tokens apply in all three.
- Related: FR-BRD-001, FR-GBL-007

---

## 4. New functional area: FR-SEO — Public-site search presence

### FR-SEO-001 — Per-route technical SEO

Every indexable customer route, in every active locale, must emit a unique non-empty title and
meta description, a self-consistent canonical URL, reciprocal `hreflang` alternates (en/ar/fr +
`x-default`), the correct `<html lang>`/`dir`, Open Graph + `twitter:card` tags, and valid
JSON-LD (Organization / LocalBusiness / Product / BreadcrumbList as applicable).
- Related: FR-CAT-001, FR-CAT-003, FR-SEO-002

### FR-SEO-002 — Crawl directives and discovery

The site must publish a valid `robots.txt` (with a `Sitemap:` line) and a `sitemap.xml` that
covers exactly the indexable routes, carries `xhtml:link` hreflang entries, and excludes
authenticated/transactional routes (account, checkout, trips), which must additionally be
`noindex`.
- Related: FR-SEO-001, FR-IAM-008

### FR-SEO-003 — Dashboard SEO settings

Authorised staff must be able to set the default title template, default description, canonical
base URL, and a global indexable on/off, through the versioned configuration workflow
(FR-ADM-005), taking effect with no redeploy. Turning indexing off must make the site
`noindex,nofollow` and empty the sitemap.
- Related: FR-ADM-005, FR-SEO-001

### FR-SEO-004 — Performance budget

Key customer routes must stay within a defined transferred-JavaScript budget and render their
primary heading without layout shift on a mid-range device. (Measurable targets are the SRS's.)
- Related: FR-GBL-007, IN-NF-02

---

## 5. New requirement in an existing area

### FR-IAM-009 — Step-up authentication for sensitive actions

A configured set of high-consequence staff actions must require the actor's **last full
password authentication to be recent**; otherwise the action is refused with a distinct
"confirm your password" outcome, and the actor may re-confirm their password in place (no new
sign-in) to proceed. A wrong password does not grant the step-up. The freshness window is
configuration.
- First protected action: triggering an immediate send of a scheduled report.
- Related: FR-IAM-003, FR-ADM-006, FR-RPT-006

---

## Appendix A — Enhancement-program delivery status of existing FR IDs

These FR IDs existed in v1.0; the enhancement program implemented them. Recorded here for
traceability (see `04-implementation/traceability-matrix.md` for code/test anchors).

| FR ID | v1.0 intent | Delivered as |
| --- | --- | --- |
| FR-FLT-005 | Preventive / corrective maintenance | `POST /ops/fleet/blocks` takes an available unit out of service (`state → maintenance`); release restores it; `/ops/fleet` maintenance card. |
| FR-FLT-003 (distribution) | Move units between locations | `POST /ops/fleet/units/:id/transfer` (guards: no open rental); `/ops/fleet` per-row transfer. |
| FR-FLT-001 / IN-F-08 | Add fleet inventory in bulk | `POST /ops/fleet/units/import` — CSV, per-row validation, dry-run, all-or-none commit; `/ops/fleet` import card. |
| FR-RNT-010 | Replacement vehicle | `POST /ops/rentals/:ref/incident` — logs an incident, immobilises on accident, optionally swaps to a validated same-category unit; rental-board form. |
| FR-INT-002 | Owned recovery of a failed consequential step | `POST /ops/cases/:id/retry` re-signals + re-checks + auto-resolves when consistent; `/ops/finance` Recovery & reconciliation screen (list + resolve + run reconciliation). |
| FR-RPT-006 | Data-quality and audit reporting | `GET /ops/data-quality` — 6 referential-integrity / drift checks with samples; `/ops/data-quality` screen. |
| FR-RPT-006 (scheduled delivery) | Recurring report delivery policy | `POST /ops/reports/schedules/:id/send` re-authorises the owner at send time, pausing + recording a reason when they no longer qualify. |
| FR-ADM-012 | Dynamically managed translations | Languages admin + translation catalogue (draft→review→publish, completeness report, public published overlay `GET /meta/translations`). |
| FR-GBL-007 | Accessible task completion | `verify:a11y` (axe) 0 serious/critical across every `/ops` screen and the key customer routes, light + dark. |

## Appendix B — Verification

No code changed to produce this amendment. The suites that would detect a behaviour gap were
re-run and are green: `verify:static`, `verify:i18n` (+`--strict`), `verify:theme`,
`verify:unit`, `test:api` (15 files / 101 tests), `verify:seo`, `verify:e2e`, `verify:a11y`.
See the root `CHANGELOG.md` `[Unreleased]` for the per-increment record.
