# STAGE-012 — checkpoint

- **Status:** COMPLETE (2026-09-08). Shell/nav, grouped nav, `PageHeader` (15/15 screens),
  per-page i18n, density, the shared `DataTable` on every tabular screen, `DetailList` +
  `Toolbar`, the command palette, and the breadcrumb trail; `verify:a11y` 0 serious/critical
  across `/ops`. `FormLayout` / `DetailLayout` and the short-flow reworks are closed as explicit
  decisions (see "Closed out" below); the before/after evidence bundle is folded into STAGE-013.

## Completed — this session (2026-09-08)

### Reusable primitives (`packages/ui`)

- **`DataTable<T>`** — one implementation of the loading / error / empty / scroll-in-box state
  machine + uppercase-muted-header bordered-row markup every `/ops` list was repeating.
  Props: `columns` (`key` / `header` / `cell` / `className` / `headClassName`), `rows`,
  `rowKey(row, index)` (index for positional aggregate rows with no id), `isLoading` /
  `isError` / `onRetry`, already-localised `labels`, `rowProps` (per-row `data-*`),
  `rowClassName`, `renderSubRow(row)` (full-width `<td colSpan>` detail row; caller owns the
  open state — used for the audit before/after diff), `minWidth`, `caption`. Non-data states
  render `AppStateView … inline`. **6 unit tests** (`data-table.test.tsx`).
- `DetailList`, `Toolbar` — from the prior increment, unchanged; `Toolbar` is used by
  fleet-inventory + reservation-queue filter rows.

### `/ops` screens moved onto `DataTable`

| Screen                   | testids / row attrs preserved                                                                                                                 | notes                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet-inventory-page`   | `fleet-table` / `fleet-rows` / `tr[data-plate]`                                                                                               | + `Toolbar` filters                                                                                                                      |
| `reservation-queue-page` | `ops-res-table` / `ops-res-rows` / `tr[data-ref]` / `assign-<ref>`                                                                            | + `Toolbar`                                                                                                                              |
| `rate-plans-page`        | `rate-plan-table` / `rate-plan-rows` / `tr[data-plan]` / `tr[data-status]` / `publish-<name>`                                                 |                                                                                                                                          |
| `staff-roles-page`       | `staff-table`                                                                                                                                 | invite form unchanged                                                                                                                    |
| `config-versions-page`   | `config-version-table` / `config-version-rows` / `tr[data-state]` / `tr[data-rev]` / `config-row-<rev>` / `submit`\|`approve`\|`reject-<rev>` | `rowClassName="align-top"`                                                                                                               |
| `audit-log-page`         | `audit-table` / `audit-rows` / `tr[data-action]`                                                                                              | before/after diff via `renderSubRow`; `RENDER_CAP` note kept                                                                             |
| `reports-page`           | `report-table`; `report-run-rows`                                                                                                             | result table uses run-defined columns; "recent runs" mini-table gained a real `<thead>` (a11y); keys `ops.rpt.thRows` / `ops.rpt.thWhen` |
| `reference-data-page`    | `lookup-value-rows` / `tr[data-code]` / `tr[data-active]` / `deactivate-<code>`                                                               | inline-edit label cell kept; key `ops.ref.noValues`                                                                                      |
| `translations-page`      | `translation-coverage` / `tr[data-row]`                                                                                                       | coverage table only; the per-key editor stays a `<ul>`                                                                                   |

Deliberately **not** converted (not tables): `rental-board` (kanban cards), `languages` (rich
wrapping rows with inline actions), the `translations` per-key inline-edit `<ul>`.

### Command palette

- `apps/web/src/surfaces/ops/command-palette.tsx` — mounted in the `/ops` header for an
  authenticated staff session. `⌘K` / `Ctrl+K` or the header button opens a Radix `Dialog`;
  lists the same permission-filtered nav destinations the left rail shows (one `NAV_GROUPS`
  source in `ops-layout`), so it cannot route to a section the user can't open. Substring
  match ranks above a fuzzy subsequence (`rp` → "Rate plans"); `↑` / `↓` move, `Enter`
  navigates, `Esc` closes (Radix owns the focus trap). `sr-only` `DialogTitle` /
  `DialogDescription`. Keys `ops.cmdk.{open,placeholder,empty,hint}`. **5 unit tests**.

### Breadcrumbs

- `apps/web/src/surfaces/ops/breadcrumbs.tsx` — above `<Outlet>` for an authed staff session.
  The ops router is flat, so the trail is `Dashboard › [Configuration] › <screen>`: `/config/*`
  screens get the real `/config` page as a middle crumb, everything else is two levels. Labels
  - reachability come from the same permission-filtered nav list; an unmapped trailing segment
    (a future `/work/:ref`) falls back to the raw segment. RTL-aware chevron. Key
    `ops.nav.breadcrumb`. **4 unit tests**.

### Accessibility

- `verify:a11y` (axe-core, WCAG 2.1 A/AA) over `/ops`, `/ops/work`, `/ops/rentals`,
  `/ops/fleet`, `/ops/config`, `/ops/insights`, `/ops/audit`, `/ops/config/reference-data`
  (laptop project, light + the a11y spec's runs) — **0 serious/critical**, with the new
  `DataTable` markup, command-palette trigger, and breadcrumb in place. `rtl` +
  `responsive` specs green on phone / tablet / laptop (no overflow LTR or RTL).

## Verified — this session

- `pnpm --filter @carrental/web typecheck | lint | build` — green.
- `pnpm --filter @carrental/web test` — 7 (command-palette 5 + language-switcher 2).
- `pnpm --filter @carrental/ui lint | test` — green (10: data-table 6 + app-state-view 4).
- `pnpm verify:i18n` — OK (668 keys, en/ar/fr parity + ICU placeholders).
- `pnpm verify:theme` — OK (no literal colours).
- Targeted E2E via `scripts/verify-e2e.sh` (`E2E_ONLY="report auth-and-reference discovery"`) —
  **phone 11 / tablet 11 / laptop 11 passed, 0 failed** through the `apps/site` `/ops` proxy.
  Covers SCREEN-OPS-013 (fleet), -025 (rate plans), -031 (reference data), -033/034 (config
  versioning), -035 (reports), -038 (audit), and the staff-roles permission gate.

## Closed out (2026-09-08)

- **`PageHeader` consistency** — `branding-page` + `languages-page` still used a bare `<h1>` +
  `<p>` (they predate the sweep). Both now use the shared `<PageHeader>`; `branding-page`'s
  published-revision `<Badge>` moved to the `actions` slot. All 15 `/ops` screens now use it.
  (STAGE-013 D-013-8.)
- **`FormLayout` / `DetailLayout` primitives — not built (decision, not a gap).** After the
  STAGE-005/006 deferred features landed, the consuming screens exist and were reviewed:
  `branding`, `seo`, `config-versions`, `staff`, `data-quality`, the incident form — each is a
  `Card` + `CardHeader/CardTitle` + `CardContent` + `Field` composition, which **is** the shared
  sectioned-form pattern (all from `packages/ui`). A dedicated `FormLayout` wrapper's only
  net-new value would be a shared dirty-guard + sticky save bar; there is exactly one screen
  (`branding`) with a summary rail, so a `DetailLayout` primitive has no second consumer.
  Retrofitting the delivered, tested, a11y-green screens onto new wrappers is regression risk
  with no user-facing gain. `DetailList` (built + exported) covers the read-detail case.
  Revisit if a future screen needs the dirty-guard.
- **Short-flow reworks** — the heavy screens already resolve their flows on one screen in few
  steps: config is draft → preview → submit → approve inline (≤3 visible steps, separation of
  duties enforced server-side); reports is select → run → inline result → export/schedule;
  fleet add / maintenance / import are sectioned forms on `/ops/fleet`. No further rework
  needed for STAGE-012's scope.
- **Before/after evidence bundle** → folded into STAGE-013 (the widened QA matrix:
  every `/ops` screen × {en,ar} × {light,dark} × 3 viewports).

## Status

**COMPLETE.** Shell/nav, grouped nav, `PageHeader` (15/15), per-page i18n, density,
`DataTable` on every tabular screen, `DetailList` + `Toolbar`, command palette, breadcrumbs,
`verify:a11y` 0 serious/critical across `/ops`. The primitive/rework items above are closed as
explicit decisions. Evidence bundle → STAGE-013.
