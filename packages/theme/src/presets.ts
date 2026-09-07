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
    id: 'slate-blue',
    label: 'Slate & Blue',
    description: 'The default. Cool neutrals with a confident blue accent.',
    config: DEFAULT_BRAND_CONFIG,
  },
  {
    id: 'emerald',
    label: 'Emerald',
    description: 'Calm green accent on the same neutral base.',
    config: preset(
      {
        primary: '158 82% 26%',
        primaryForeground: '0 0% 100%',
        ring: '158 82% 30%',
        accent: '152 45% 92%',
        accentForeground: '158 65% 15%',
      },
      {
        primary: '154 62% 56%',
        primaryForeground: '158 60% 9%',
        ring: '154 62% 56%',
        accent: '156 28% 20%',
        accentForeground: '152 45% 90%',
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
