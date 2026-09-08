# STAGE-012 — Operations dashboard UX overhaul · plan

## Objective / outcome

`apps/web` (`/ops` only, post-split) raised to a professional operations-console bar: clear
information hierarchy, intuitive navigation, short flows, strong accessibility, responsive to
phone, full light/dark + brand theming parity, and a consistent set of reusable patterns. **No
API or business-behaviour change.**

## Source IDs

Mandate §1.5, §1.7 (enhancement-program.md); SRS-UI-001..015, SRS-NFR-010/012 (WCAG 2.2 AA),
SRS-OPS-\* screen specs, design plan §§ (ops surface).

## Workstreams

### 1. Shell & navigation

- Grouped, collapsible sidebar (Work · Fleet · Finance · Configuration · Insights · Audit) with
  role-aware visibility; top bar with breadcrumb, global search / command palette (`⌘K`),
  environment + health chip, account + theme + language menus.
- Responsive: sidebar → drawer on tablet, bottom-sheet nav on phone; every screen usable at
  360 px with no horizontal overflow.

### 2. Reusable patterns (`packages/ui`)

- `PageHeader` (title, description, primary action, breadcrumb), `DataTable` (sort, filter,
  column visibility, pagination, row actions, bulk actions, sticky header, empty/loading/error,
  CSV export), `DetailLayout` (summary rail + tabbed body), `FormLayout` (section groups,
  sticky save bar, inline validation, dirty guard), `FilterBar`, `StatCard`, `Timeline`,
  `ConfirmDialog`, `AppStateView` (already exists — extend). All themeable, all a11y-audited.

### 3. Screen-by-screen rework

- Apply the patterns to: dashboard, reservation queue (`work`), fleet inventory, rate plans,
  rental board, finance / recovery cases, config versioning, reports hub, audit viewer,
  reference data, staff & roles, translations, languages, branding, SEO.
- Shorten the heavy flows: config draft→submit→approve in ≤ 3 steps with a visible state
  machine; report run as a guided 2-pane builder; fleet add/maintenance as a single sectioned
  form; bulk actions on the queue.
- Consistent status vocabulary (icon + label + tint token, never colour alone).

### 4. Accessibility

- Keyboard: full operability, visible focus, logical order, focus-trap dialogs, skip link,
  live-region announcements for async results.
- axe over every `/ops` screen in light + dark (`verify:a11y`), 0 serious/critical.

### 5. Density & theming

- `comfortable | compact` density from the theme config; verify both.
- Every `/ops` screen re-themes with a brand preset and in dark mode without regression.

## Acceptance criteria

- Every `/ops` screen uses the shared patterns; no bespoke one-off table/form/header remains.
- Usable and non-overflowing at 360 / 768 / 1280 px; dark + 2 brand presets clean.
- `verify:a11y` 0 serious/critical across all `/ops` screens, both themes.
- Task time / clicks for the 5 heavy flows reduced vs. the STAGE-006/007 baseline (recorded).
- `verify:static | unit | api | migrate | e2e | a11y` green; no contract/behaviour diff.

## Test evidence (→ `test-evidence.md`)

Before/after screenshots of all `/ops` screens (light + dark, 3 viewports); axe run;
flow click-count table; `ops-e2e` updates.
