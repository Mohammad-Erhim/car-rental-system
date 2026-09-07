import type { BrandConfig } from './schema.js';
import { COLOR_TOKENS, cssVarName, FONTS, RADII, type ColorScale } from './tokens.js';

export type ThemeMode = 'light' | 'dark';

/** All CSS custom properties for one mode, keyed by var name (`--primary` → `"222 74% 40%"`). */
export function resolveCssVars(config: BrandConfig, mode: ThemeMode): Record<string, string> {
  const scale: ColorScale = config.colors[mode];
  const vars: Record<string, string> = {};
  for (const token of COLOR_TOKENS) vars[cssVarName(token)] = scale[token];
  vars['--radius'] = RADII[config.radius as keyof typeof RADII] ?? RADII.md;
  // `--font-brand` is set by the host when a curated web font is actually loaded (apps/site
  // wires `next/font`); its `var()` fallback is the first family of the curated stack so an
  // environment without the web font still resolves to something sensible.
  const stack = FONTS[config.font as keyof typeof FONTS]?.stack ?? FONTS.inter.stack;
  const firstComma = stack.indexOf(',');
  const primary = firstComma === -1 ? stack : stack.slice(0, firstComma).trim();
  const rest = firstComma === -1 ? '' : stack.slice(firstComma + 1).trim();
  vars['--font-sans'] = `var(--font-brand, ${primary})${rest ? `, ${rest}` : ''}`;
  return vars;
}

function block(selector: string, colorScheme: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selector} {\n  color-scheme: ${colorScheme};\n${body}\n}`;
}

/**
 * A stylesheet fragment: `<selector> { …light… }` + `<darkSelector> { …dark overrides… }`.
 * Only vars that differ from light are emitted for dark. Used by the token-CSS generator
 * (defaults) and to serialise a published brand override into `<style>` at runtime.
 */
export function brandConfigToCss(config: BrandConfig, selector = ':root'): string {
  const light = resolveCssVars(config, 'light');
  const dark = resolveCssVars(config, 'dark');
  const darkDiff: Record<string, string> = {};
  for (const [k, v] of Object.entries(dark)) if (light[k] !== v) darkDiff[k] = v;
  const darkSelector = selector === ':root' ? '.dark' : `${selector}.dark, .dark ${selector}`;
  return `${block(selector, 'light', light)}\n\n${block(darkSelector, 'dark', darkDiff)}\n`;
}

/** Just the two var maps — for injecting via `element.style.setProperty` without a stylesheet. */
export function brandConfigToVarMaps(config: BrandConfig): {
  light: Record<string, string>;
  dark: Record<string, string>;
} {
  return { light: resolveCssVars(config, 'light'), dark: resolveCssVars(config, 'dark') };
}
