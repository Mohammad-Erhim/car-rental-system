import { z } from 'zod';

import { AA_LARGE, AA_NORMAL, contrastRatio } from './contrast.js';
import {
  COLOR_TOKENS,
  DEFAULT_DARK,
  DEFAULT_DENSITY,
  DEFAULT_FONT,
  DEFAULT_LIGHT,
  DEFAULT_RADIUS,
  DENSITIES,
  FONTS,
  RADII,
  type ColorScale,
} from './tokens.js';

/** `"H S% L%"` — the shape every colour token takes. */
export const hslTriple = z
  .string()
  .trim()
  .regex(/^-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/, 'expected "H S% L%"');

const colorScaleShape = Object.fromEntries(COLOR_TOKENS.map((t) => [t, hslTriple])) as Record<
  (typeof COLOR_TOKENS)[number],
  typeof hslTriple
>;
export const colorScaleSchema = z.object(colorScaleShape);

export const brandAssetsSchema = z.object({
  /** object-storage refs (opaque keys); the API resolves them to signed URLs in `meta/branding`. */
  logo: z.string().max(512).nullable().default(null),
  logoDark: z.string().max(512).nullable().default(null),
  favicon: z.string().max(512).nullable().default(null),
  ogImage: z.string().max(512).nullable().default(null),
  /** display name shown next to / instead of the logo */
  wordmark: z.string().max(80).default('Car Rental'),
});
export type BrandAssets = z.infer<typeof brandAssetsSchema>;

export const brandConfigSchema = z.object({
  colors: z.object({ light: colorScaleSchema, dark: colorScaleSchema }),
  radius: z.enum(Object.keys(RADII) as [string, ...string[]]).default(DEFAULT_RADIUS),
  density: z.enum(DENSITIES).default(DEFAULT_DENSITY),
  font: z.enum(Object.keys(FONTS) as [string, ...string[]]).default(DEFAULT_FONT),
  assets: brandAssetsSchema.default(brandAssetsSchema.parse({})),
});
export type BrandConfig = z.infer<typeof brandConfigSchema>;

export const DEFAULT_BRAND_CONFIG: BrandConfig = brandConfigSchema.parse({
  colors: { light: DEFAULT_LIGHT, dark: DEFAULT_DARK },
  radius: DEFAULT_RADIUS,
  density: DEFAULT_DENSITY,
  font: DEFAULT_FONT,
  assets: {},
});

/** Token pairs that must clear a contrast bar in a given scale. */
const CONTRAST_RULES: Array<{ fg: keyof ColorScale; bg: keyof ColorScale; min: number }> = [
  { fg: 'foreground', bg: 'background', min: AA_NORMAL },
  { fg: 'cardForeground', bg: 'card', min: AA_NORMAL },
  { fg: 'popoverForeground', bg: 'popover', min: AA_NORMAL },
  { fg: 'primaryForeground', bg: 'primary', min: AA_NORMAL },
  { fg: 'secondaryForeground', bg: 'secondary', min: AA_NORMAL },
  { fg: 'accentForeground', bg: 'accent', min: AA_NORMAL },
  { fg: 'mutedForeground', bg: 'background', min: AA_NORMAL },
  { fg: 'destructiveForeground', bg: 'destructive', min: AA_NORMAL },
  { fg: 'successForeground', bg: 'success', min: AA_NORMAL },
  { fg: 'warningForeground', bg: 'warning', min: AA_NORMAL },
  { fg: 'ring', bg: 'background', min: AA_LARGE },
  { fg: 'border', bg: 'background', min: 1.2 },
];

export interface ContrastViolation {
  mode: 'light' | 'dark';
  fg: string;
  bg: string;
  ratio: number;
  min: number;
}

/** Structural + WCAG validation. Returns [] when the config is safe to publish. */
export function validateBrandConfig(config: BrandConfig): ContrastViolation[] {
  const out: ContrastViolation[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const scale = config.colors[mode];
    for (const rule of CONTRAST_RULES) {
      const ratio = contrastRatio(scale[rule.fg], scale[rule.bg]);
      if (ratio + 1e-6 < rule.min) {
        out.push({
          mode,
          fg: rule.fg,
          bg: rule.bg,
          ratio: Math.round(ratio * 100) / 100,
          min: rule.min,
        });
      }
    }
  }
  return out;
}
