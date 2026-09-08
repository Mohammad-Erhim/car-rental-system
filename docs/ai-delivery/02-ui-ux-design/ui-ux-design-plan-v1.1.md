# Car Rental System — UI/UX Design and Flow Plan v1.1 (Enhancement-Program Amendment)

## 1. Document Information

| Field | Value |
| --- | --- |
| Document | UI/UX Design and Flow Plan — Amendment v1.1 |
| Version | 1.1 (amends v1.0; does not supersede it) |
| Status | Proposed — pending Stage-gate acceptance (`00-control/changes/CR-20260907-001`) |
| Baseline date | 2026-09-08 |
| Base document | `ui-ux-design-plan-v1.0.md` (unchanged; all SCREEN/FLOW IDs remain stable) |

### 1.1 Nature of this amendment

Documents design and flow decisions that are implemented on branch `implementation` and were
not in v1.0. It adds new SCREEN IDs for genuinely new screens; where a v1.0 SCREEN/FLOW was
merely *built*, that is recorded in §A. No visual or flow decision here contradicts v1.0.

---

## 2. Amendments to v1.0 sections

### 2.1 §3 Actor and Application Map — two customer/ops surfaces

The customer experience (v1.0 "APP-CWEB") is delivered by **`apps/site`**, a Next.js App
Router application: server-rendered, `/{locale}/…` path routing (en/ar/fr), statically
generated + revalidated where the data allows. The operations experience is **`apps/web`**
(the existing Vite SPA) reduced to `/ops`. Both consume the same `@carrental/ui` design system,
the same brand tokens, and the same API. In production one origin serves both (`/` → site,
`/ops` → dashboard).

Design consequence: the customer site's first paint is HTML, not a JS shell — hero, search
form, category grid, and vehicle detail are usable before hydration; brand tokens are inlined
in `<head>` (no flash of unstyled content).

### 2.2 §2 Design Principles — light/dark + brand tokens

Every screen on both surfaces renders in light, dark, and "match device", chosen with a
visible per-user `ThemeToggle` whose choice persists. All colour, radius, and density come from
the published brand configuration (curated tokens; no arbitrary CSS). The design must pass
WCAG 2.2 AA contrast in **both** modes for every token pair — enforced before a brand version
can be drafted (`verify:theme`).

### 2.3 §4.2 Operations navigation — grouped rail + palette + breadcrumb

- The `/ops` left rail is **grouped** (Operations · Catalogue · Configuration · Administration),
  each item permission-filtered; a group with nothing visible is not rendered.
- A **command palette** (`⌘K` / `Ctrl+K`, or a header button) lists exactly the same
  permission-filtered destinations; substring match ranks above a fuzzy subsequence.
- A **breadcrumb** sits above each screen: `Dashboard › [Configuration] › <screen>` (the flat
  ops router yields a two- or three-level trail; `/config/*` screens show the real
  configuration page as the middle crumb). RTL-aware.
- The header also carries: environment/health chip, "view public site", theme toggle, language
  switcher, account, sign-out.

### 2.4 §4.4 Shared interactive-element contracts — the `DataTable` pattern

Every tabular list on `/ops` uses one `DataTable` primitive: a single implementation of the
loading / error (with retry) / empty states, an uppercase-muted column header, bordered rows,
horizontal scroll contained in the component's own box (the page never scrolls sideways), an
optional full-width detail row under a row (used for the audit before/after diff), and stable
`data-testid` hooks. Filters sit in a `Toolbar` above the table. Detail panes use a
`DetailList` (`<dl>` grid).

---

## 3. New screens

### SCREEN-OPS-040 — Branding & theme editor (`/ops/config/branding`)
Colour pickers (primary / accent / semantic) with a live AA-contrast check, radius + density +
font selectors, and per-purpose asset uploads (logo / favicon / OG image) with inline
validation feedback. Sits on the standard draft → submit → approve/publish workflow with a
"Preview effect" projection. Related: FR-BRD-001..004, FLOW-OPS-013.

### SCREEN-OPS-041 — SEO settings (`/ops/config/seo`)
Default title template, default description, canonical base URL, global indexable toggle, with
a preview of the resulting home and vehicle `<title>` and a warning when the description would
truncate in a result snippet. Versioned. Related: FR-SEO-003, FLOW-OPS-013.

### SCREEN-OPS-042 — Languages admin (`/ops/config/languages`)
Active locales as rich rows (native + English name, code, direction, default star, coverage %),
with activate / deactivate / make-default actions and an "add language" form. Related:
FR-GBL-004, FR-ADM-012, FLOW-OPS-014.

### SCREEN-OPS-043 — Recovery & reconciliation (`/ops/finance`)
Replaces the finance placeholder. A `DataTable` of open recovery cases (kind · severity ·
subject · summary · retry count · age) with **Retry** (re-signal + re-check + auto-resolve when
consistent) and **Resolve**; a second table of payment reconciliation exceptions with
**Resolve** and a **Run reconciliation** action. Related: FR-INT-002, FR-PAY-009,
FLOW-OPS-012.

### SCREEN-OPS-044 — Data quality (`/ops/data-quality`)
Read-only. A `DataTable` of referential-integrity / drift checks (title · severity · finding
count · sample keys), a **Re-run checks** button, and an all-clear / N-need-attention banner.
Related: FR-RPT-006 (SCREEN-OPS-039 lineage), FLOW-OPS-017.

### SCREEN-SHARED-STEP-UP — Step-up password dialog
A small modal shown by either surface when an action returns "confirm your password". One
password field, confirm / cancel; on success the original action is retried once. No new
sign-in, no navigation. Related: FR-SEC-014.

---

## 4. Amended screens (behaviour added, ID unchanged)

- **SCREEN-OPS-013 Fleet inventory** — gains, for `fleet.manage`: per-row **Maintenance** and
  **Transfer** actions, a **Maintenance & blocks** table with **Release**, and a **Bulk import**
  card (CSV paste / file → **Validate** → per-row error table → **Import N units**). (FLOW-OPS-008/009/010.)
- **SCREEN-OPS-009/012/016 Rental board** — an in-progress rental card gains **Report incident**
  → a form (category, note, replacement-vehicle picker). (FLOW-OPS-007.)
- **SCREEN-OPS-035 Reports** — the schedules list gains a **Send now** action per row and a
  paused badge with the last skip reason. (FLOW-OPS-017.)
- **SCREEN-OPS-034 Translation catalogue** — a filter box + a 50-row cap + "show more" (650
  keys made the full page unwieldy).
- **Customer site** — the search results list, vehicle-detail "reserve" island (live price +
  hold + route to checkout), the localised soft-404, and per-locale `<title>`/metadata on every
  route are `apps/site` design decisions folded into SCREEN-CUS-002..007.

---

## Appendix A — Enhancement-program delivery of existing SCREEN/FLOW IDs

| ID | v1.0 intent | Delivered |
| --- | --- | --- |
| FLOW-OPS-007 | Replace vehicle after incident | rental-board incident form + `POST /ops/rentals/:ref/incident`. |
| FLOW-OPS-008 | Block / maintain / return a vehicle to service | fleet maintenance blocks (state-aware) + release. |
| FLOW-OPS-009 | Transfer a vehicle | fleet per-row transfer + `POST /ops/fleet/units/:id/transfer`. |
| FLOW-OPS-010 | Import / bulk-update fleet | fleet CSV import card + `POST /ops/fleet/units/import`. |
| FLOW-OPS-012 | Refund / dispute / reconcile payment | `/ops/finance` recovery-case + reconciliation panel. |
| SCREEN-OPS-039 | Data-quality panel | `/ops/data-quality`. |
| FLOW-OPS-017 | Schedule report + failure task | schedule "send now" with owner re-auth + skip reason. |
| §4.2 / SRS-UI-011 | Consistent ops table / navigation patterns | `DataTable` across every list; command palette; breadcrumb. |
| SRS-NFR a11y | axe over every `/ops` screen | `verify:a11y` 0 serious/critical, light + dark. |

## Appendix B — Verification

`verify:a11y`, `verify:seo`, `verify:e2e` (customer + ops flows), `verify:static`,
`verify:i18n --strict` (0 literals in either front end). Evidence in the root `CHANGELOG.md`
`[Unreleased]` and the per-stage `checkpoint.md` files.
