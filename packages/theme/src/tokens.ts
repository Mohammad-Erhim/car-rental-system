/**
 * Design-token catalogue (SRS-UI-002). Single source of truth for the shadcn-style HSL CSS
 * variables consumed by `packages/ui`, `apps/web`, and `apps/site`. The default values here are
 * byte-for-byte the ones previously hand-maintained in two `styles.css` copies; the generator
 * (`scripts/gen-tokens-css.mjs`) writes them back into those files between markers so the two
 * can never drift again (checked by `verify:theme`).
 *
 * A token value is an HSL triple string — `"H S% L%"` — used as `hsl(var(--x))` in CSS.
 */

/** Colour token keys (camelCase). One CSS custom property each. */
export const COLOR_TOKENS = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'success',
  'successForeground',
  'warning',
  'warningForeground',
  'border',
  'input',
  'ring',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Map a camelCase token key to its CSS custom-property name (`cardForeground` → `--card-foreground`). */
export function cssVarName(token: ColorToken): string {
  return '--' + token.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

export type ColorScale = Record<ColorToken, string>;

/** Light palette — matches the pre-STAGE-009 `:root` block exactly. */
export const DEFAULT_LIGHT: ColorScale = {
  background: '0 0% 100%',
  foreground: '222 47% 11%',
  card: '0 0% 100%',
  cardForeground: '222 47% 11%',
  popover: '0 0% 100%',
  popoverForeground: '222 47% 11%',
  primary: '222 74% 40%',
  primaryForeground: '0 0% 100%',
  secondary: '210 40% 96%',
  secondaryForeground: '222 47% 11%',
  muted: '210 40% 96%',
  mutedForeground: '215 16% 40%',
  accent: '210 40% 94%',
  accentForeground: '222 47% 11%',
  destructive: '0 74% 39%',
  destructiveForeground: '0 0% 100%',
  success: '142 72% 24%',
  successForeground: '0 0% 100%',
  warning: '30 100% 26%',
  warningForeground: '0 0% 100%',
  border: '214 32% 88%',
  input: '214 32% 84%',
  ring: '222 74% 40%',
};

/** Dark palette — matches the pre-STAGE-009 `.dark` block exactly. */
export const DEFAULT_DARK: ColorScale = {
  background: '222 47% 8%',
  foreground: '210 40% 96%',
  card: '222 44% 11%',
  cardForeground: '210 40% 96%',
  popover: '222 44% 11%',
  popoverForeground: '210 40% 96%',
  primary: '213 84% 66%',
  primaryForeground: '222 47% 11%',
  secondary: '217 33% 18%',
  secondaryForeground: '210 40% 96%',
  muted: '217 33% 17%',
  mutedForeground: '215 20% 68%',
  accent: '217 33% 20%',
  accentForeground: '210 40% 96%',
  // nudged from `0 63% 55%` (STAGE-009): white-on-solid was 4.43:1 in dark mode, just under AA.
  destructive: '0 72% 51%',
  destructiveForeground: '0 0% 100%',
  success: '142 55% 48%',
  successForeground: '222 47% 11%',
  warning: '38 92% 60%',
  warningForeground: '222 47% 11%',
  border: '217 33% 24%',
  input: '217 33% 26%',
  ring: '213 84% 66%',
};

/** Radius presets (the `--radius` CSS var). Mode-independent. */
export const RADII = {
  none: '0rem',
  sm: '0.35rem',
  md: '0.6rem',
  lg: '0.85rem',
  full: '1.25rem',
} as const;
export type RadiusKey = keyof typeof RADII;
export const DEFAULT_RADIUS: RadiusKey = 'md';

/** Density affects control heights / paddings via a `data-density` attribute on the root. */
export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];
export const DEFAULT_DENSITY: Density = 'comfortable';

/**
 * Curated font choices. `stack` is the CSS `font-family` value applied to `--font-sans`.
 * `arabic` faces additionally cover Arabic script for the `ar` locale.
 */
export const FONTS = {
  inter: {
    label: 'Inter',
    stack: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    arabic: false,
  },
  system: {
    label: 'System',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    arabic: true,
  },
  'ibm-plex-sans': {
    label: 'IBM Plex Sans',
    stack: "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif",
    arabic: true,
  },
  cairo: {
    label: 'Cairo',
    stack: "Cairo, 'Segoe UI', system-ui, sans-serif",
    arabic: true,
  },
  tajawal: {
    label: 'Tajawal',
    stack: "Tajawal, 'Segoe UI', system-ui, sans-serif",
    arabic: true,
  },
} as const;
export type FontKey = keyof typeof FONTS;
export const DEFAULT_FONT: FontKey = 'inter';
