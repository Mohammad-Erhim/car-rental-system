# STAGE-012 — checkpoint

- **Status:** IN PROGRESS. Shell/nav, `PageHeader` on all screens, grouped nav, per-page i18n,
  and density were landed in earlier sessions (see `enhancement-program.md` row 012). This
  session added the shared `DataTable` primitive + adoption across every tabular `/ops` screen,
  and the command palette. Remaining: `FormLayout` / `DetailLayout` primitives, breadcrumbs,
  the per-screen a11y sweep, and the before/after evidence bundle (→ STAGE-013).

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

| Screen | testids / row attrs preserved | notes |
| --- | --- | --- |
| `fleet-inventory-page` | `fleet-table` / `fleet-rows` / `tr[data-plate]` | + `Toolbar` filters |
| `reservation-queue-page` | `ops-res-table` / `ops-res-rows` / `tr[data-ref]` / `assign-<ref>` | + `Toolbar` |
| `rate-plans-page` | `rate-plan-table` / `rate-plan-rows` / `tr[data-plan]` / `tr[data-status]` / `publish-<name>` | |
| `staff-roles-page` | `staff-table` | invite form unchanged |
| `config-versions-page` | `config-version-table` / `config-version-rows` / `tr[data-state]` / `tr[data-rev]` / `config-row-<rev>` / `submit`\|`approve`\|`reject-<rev>` | `rowClassName="align-top"` |
| `audit-log-page` | `audit-table` / `audit-rows` / `tr[data-action]` | before/after diff via `renderSubRow`; `RENDER_CAP` note kept |
| `reports-page` | `report-table`; `report-run-rows` | result table uses run-defined columns; "recent runs" mini-table gained a real `<thead>` (a11y); keys `ops.rpt.thRows` / `ops.rpt.thWhen` |
| `reference-data-page` | `lookup-value-rows` / `tr[data-code]` / `tr[data-active]` / `deactivate-<code>` | inline-edit label cell kept; key `ops.ref.noValues` |
| `translations-page` | `translation-coverage` / `tr[data-row]` | coverage table only; the per-key editor stays a `<ul>` |

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

## Not done yet

- `FormLayout` (section groups, sticky save bar, dirty guard) + `DetailLayout` (summary rail +
  tabbed body) primitives; apply `DetailList` to the trip/reservation/rental detail panels.
- Breadcrumbs for the nested `/config/*` routes.
- Per-screen a11y sweep — `verify:a11y` (axe, light + dark) 0 serious/critical on every `/ops`
  screen; keyboard operability + live-region announcements on the async flows.
- Short-flow reworks of the heavy screens (config draft→approve in ≤3 visible steps; report
  run as a 2-pane builder; fleet add/maintenance as one sectioned form; queue bulk actions).
- Before/after evidence bundle: all `/ops` screens, light + dark, 3 viewports, 2 brand presets;
  flow click-count table vs. the STAGE-006/007 baseline (→ folded into STAGE-013).
