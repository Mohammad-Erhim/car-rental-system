import { brandConfigSchema, DEFAULT_BRAND_CONFIG, type BrandConfig } from './schema.js';
import { DEFAULT_DARK, DEFAULT_LIGHT, type ColorScale } from './tokens.js';

/** Build a preset by overriding a handful of accent tokens over the default neutrals. */
function preset(
  lightOverrides: Partial<ColorScale>,
  darkOverrides: Partial<ColorScale>,
  extras: Partial<Pick<BrandConfig, 'radius' | 'density' | 'font'>> = {},
): BrandConfig {
  return brandConfigSchema.parse({
    colors: {
      light: { ...DEFAULT_LIGHT, ...lightOverrides },
      dark: { ...DEFAULT_DARK, ...darkOverrides },
    },
    radius: extras.radius ?? DEFAULT_BRAND_CONFIG.radius,
    density: extras.density ?? DEFAULT_BRAND_CONFIG.density,
    font: extras.font ?? DEFAULT_BRAND_CONFIG.font,
    assets: {},
  });
}

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  config: BrandConfig;
}

export const PRESETS: ThemePreset[] = [
  {
    // Audit finding (2026-09): this used to be `id: 'slate-blue'` / "Slate & Blue — confident
    // blue accent", but `DEFAULT_LIGHT.primary`/`DEFAULT_DARK.primary` (tokens.ts) are the
    // shipped green brand, hue ~158, byte-identical to the 'emerald' preset below in both
    // modes — an admin saw two distinct-looking options that rendered identically. Renamed to
    // describe the actual colour; 'emerald' (below) was re-shaded to a genuinely different hue
    // so the two remain distinguishable options rather than a silent duplicate.
    id: 'evergreen',
    label: 'Evergreen',
    description: 'The default. Cool neutrals with our signature deep-green accent.',
    config: DEFAULT_BRAND_CONFIG,
  },
  {
    id: 'emerald',
    label: 'Emerald',
    description: 'A brighter, teal-leaning green accent on the same neutral base.',
    config: preset(
      {
        primary: '174 78% 24%',
        primaryForeground: '0 0% 100%',
        ring: '174 78% 28%',
        accent: '172 45% 91%',
        accentForeground: '174 65% 14%',
      },
      {
        primary: '172 65% 52%',
        primaryForeground: '174 60% 8%',
        ring: '172 65% 52%',
        accent: '173 28% 19%',
        accentForeground: '172 45% 89%',
      },
    ),
  },
  {
    id: 'violet',
    label: 'Violet',
    description: 'Deep violet accent — a distinctive, premium feel.',
    config: preset(
      {
        primary: '262 68% 44%',
        primaryForeground: '0 0% 100%',
        ring: '262 68% 48%',
        accent: '266 48% 94%',
        accentForeground: '262 52% 24%',
      },
      {
        primary: '263 84% 76%',
        primaryForeground: '265 55% 11%',
        ring: '263 84% 76%',
        accent: '264 30% 24%',
        accentForeground: '266 48% 92%',
      },
    ),
  },
  {
    id: 'amber',
    label: 'Warm Amber',
    description: 'Warm accent with slightly rounder corners.',
    config: preset(
      {
        primary: '26 88% 34%',
        primaryForeground: '0 0% 100%',
        ring: '26 88% 38%',
        accent: '40 64% 91%',
        accentForeground: '26 62% 20%',
      },
      {
        primary: '36 92% 62%',
        primaryForeground: '28 62% 11%',
        ring: '36 92% 62%',
        accent: '32 34% 22%',
        accentForeground: '40 60% 88%',
      },
      { radius: 'lg' },
    ),
  },
];

export const PRESET_BY_ID: Record<string, ThemePreset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
);
