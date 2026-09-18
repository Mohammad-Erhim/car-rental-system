import type { BrandConfig } from '@carrental/theme';
import { contrastRatio } from '@carrental/theme';

export type Mode = 'light' | 'dark';

/** The colour tokens an operator can change; each pairs with a `…Foreground` computed for legibility. */
export const EDITABLE = [
  'primary',
  'accent',
  'ring',
  'background',
  'foreground',
  'card',
  'muted',
  'border',
  'destructive',
  'success',
  'warning',
] as const;
export type EditableToken = (typeof EDITABLE)[number];

/** White or near-black, whichever reads better on `bg` (an HSL triple). */
export function readableOn(bg: string): string {
  return contrastRatio('0 0% 100%', bg) >= contrastRatio('0 0% 9%', bg) ? '0 0% 100%' : '0 0% 9%';
}

/** Set one colour and recompute its foreground, without touching the original config. */
export function setToken(
  cfg: BrandConfig,
  mode: Mode,
  token: EditableToken,
  triple: string,
): BrandConfig {
  const next = structuredClone(cfg);
  next.colors[mode][token] = triple;
  const fgKey = `${token}Foreground` as keyof BrandConfig['colors']['light'];
  if (fgKey in next.colors[mode]) next.colors[mode][fgKey] = readableOn(triple);
  return next;
}

export const ASSET_KEYS = ['logo', 'logoDark', 'favicon', 'ogImage'] as const;
export type AssetKey = (typeof ASSET_KEYS)[number];

export const acceptFor = (k: AssetKey) =>
  k === 'ogImage'
    ? 'image/png,image/jpeg,image/webp'
    : k === 'favicon'
      ? 'image/png,image/x-icon,.ico'
      : 'image/png,image/jpeg,image/webp,image/svg+xml';
