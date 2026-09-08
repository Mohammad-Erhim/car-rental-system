# STAGE-009 — Design system, theming & branding · plan

## Objective / outcome

One design-token source of truth; system-wide **light / dark / system** modes; a **curated,
brand-customizable theming + branding** capability managed from the dashboard, versioned through
the STAGE-006 `configVersion` workflow, and applied live (no rebuild) to **both** the public
site and the operations dashboard.

## Source IDs

Mandate §1.1–§1.3, §1.7 (enhancement-program.md); DEC-025; SRS-UI-002 (tokens), SRS-UI-007
(focus/contrast), SRS-NFR-010/012 (WCAG 2.2 AA, never colour-alone), SRS-ADM-006 (config
approval), SRS-DAT-009 (object storage), FR-ADM-_ (config management), SRS-SEC-_ (upload
validation).

## Workstreams

### 1. `packages/theme` (new)

- Token schema (`zThemeConfig` in `contracts`): `colors` (background, foreground, card, popover,
  primary, secondary, muted, accent, border, input, ring, destructive, success, warning — each
  as an HSL triple, light + dark maps), `radius` (`0`–`1rem` preset scale), `density`
  (`comfortable | compact`), `font` (key from a curated set: Inter, Geist, Source Sans, IBM
  Plex, Cairo/Tajawal for Arabic), `logo`/`logoDark`/`favicon`/`ogImage` (asset refs).
- `resolveTokens(config, mode) → Record<cssVar, string>` and `tokensToCss(...)` — pure, shared.
- Curated **presets** (e.g. "Slate/Blue" default, plus 3–4 alternates) so a brand can start
  from one click; a validator that rejects a preset failing AA in either mode.

### 2. Token unification

- Delete the duplicated blocks in `apps/web/src/index.css` and `packages/ui/src/styles.css`;
  generate both from `packages/theme` defaults at build; keep the non-token base CSS.
- `packages/ui` primitives already consume the CSS vars — audit for any literal colours and
  route them through tokens (`verify:theme` guard).

### 3. `ThemeProvider` + mode

- Shared provider (in `packages/ui`): `mode` = `light | dark | system`, persisted
  (`localStorage` + cookie for SSR), sets `class="dark"` + `color-scheme`; honours
  `prefers-color-scheme` for `system`; no flash (inline head script in `apps/site`, pre-paint
  apply in `apps/web`).
- Applies the published brand tokens over the defaults on boot.
- Theme toggle component (a11y: `aria-pressed`, keyboard) in both app shells.

### 4. API — branding config + assets

- `branding` `configVersion` kind: draft → submit → approve → publish (reuse
  `config-version.service`). Emits `config.version.published.v1`.
- `GET /api/v1/meta/branding` — **public**, returns the published `zBrandConfig` (tokens + asset
  URLs), `Cache-Control` + strong `ETag`; 200-line budget.
- `POST /api/v1/ops/branding/assets` — `config.publish` perm; accepts png/svg/webp/ico, size +
  dimension + MIME sniff limits, stores via `ObjectStoragePort`, returns a signed URL + ref;
  SVG sanitised.
- `GET/POST /api/v1/ops/branding` — read draft/published, write draft.

### 5. Dashboard — Branding & Theme section (`/ops/config/branding`)

- Colour controls (primary/accent/semantic) with live preview on a sample surface, light+dark
  swatches, contrast read-out; radius + density presets; font picker; logo/favicon/OG upload
  with preview; "start from preset"; draft banner + submit/approve/publish reusing the
  config-version UI; revert to a prior version.

### 6. Contracts + seed

- `zThemeConfig`, `zBrandConfig`, `zBrandingConfigVersionPayload` in `packages/contracts`
  (+ drift check). System seed writes the default preset as the published `branding` v1.

## Acceptance criteria

- Toggling light/dark/system re-themes **every** existing screen in both apps with correct
  contrast; no unstyled flash; choice persists across reload and (where signed in) devices.
- Changing a brand colour / radius / density / logo in the dashboard, approving + publishing,
  is reflected on the public site and the dashboard **without a rebuild** within one cache TTL.
- All seeded presets pass WCAG AA (light + dark) — `verify:theme`.
- No component ships a hardcoded colour — `verify:theme` lint.
- `verify:static | unit | api | migrate` green; new `branding.spec.ts` (config-version flow,
  asset validation, public endpoint ETag/permissions).

## Test evidence (→ `test-evidence.md`)

`verify:theme` output; `branding.spec.ts`; before/after screenshots of 4–5 representative
screens in light + dark and in 2 brand presets; the public `GET /meta/branding` response.
