/**
 * `@carrental/theme` — the single source of truth for design tokens and the runtime theming
 * engine shared by `packages/ui`, `apps/web`, and `apps/site` (SRS-UI-002, DEC-025).
 *
 * - token catalogue + defaults (`tokens.ts`) — kept in sync with the two `styles.css` files by
 *   `scripts/gen-tokens-css.mjs` (`verify:theme`);
 * - `brandConfigSchema` — the shape the dashboard edits and the API versions/serves;
 * - `resolveCssVars` / `brandConfigToCss` — turn a config into CSS custom properties;
 * - `validateBrandConfig` — WCAG AA gate for presets and user edits;
 * - `PRESETS` — curated starting points.
 */
export * from './tokens.js';
export * from './contrast.js';
export * from './schema.js';
export * from './resolve.js';
export * from './presets.js';

export const BRAND_TOKENS_STYLE_ID = 'carrental-brand-tokens';
/** localStorage key for the brand config JSON (consumed by the ThemeProvider). */
export const BRAND_CACHE_KEY = 'carrental.brand.v1';
/** localStorage key for the pre-rendered brand CSS (consumed by the FOUC head script). */
export const BRAND_CSS_CACHE_KEY = 'carrental.brand.css.v1';
