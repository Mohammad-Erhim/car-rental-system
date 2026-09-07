import { describe, expect, it } from 'vitest';

import { contrastRatio, hslTripleToRgb, parseHslTriple } from './contrast.js';
import { PRESETS } from './presets.js';
import { brandConfigToCss, resolveCssVars } from './resolve.js';
import { DEFAULT_BRAND_CONFIG, validateBrandConfig } from './schema.js';
import { DEFAULT_DARK, DEFAULT_LIGHT } from './tokens.js';

describe('contrast maths', () => {
  it('parses "H S% L%" triples', () => {
    expect(parseHslTriple('222 74% 40%')).toEqual({ h: 222, s: 0.74, l: 0.4 });
  });

  it('black on white is 21:1, white on white is 1:1', () => {
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 0);
    expect(contrastRatio('0 0% 100%', '0 0% 100%')).toBeCloseTo(1, 5);
  });

  it('hslTripleToRgb round-trips known colours', () => {
    expect(hslTripleToRgb('0 0% 100%')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hslTripleToRgb('0 0% 0%')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('rejects a malformed triple', () => {
    expect(() => parseHslTriple('#3366cc')).toThrow();
  });
});

describe('brand config', () => {
  it('the default config is valid and AA-clean in both modes', () => {
    expect(validateBrandConfig(DEFAULT_BRAND_CONFIG)).toEqual([]);
  });

  it('every curated preset is AA-clean in light and dark', () => {
    for (const p of PRESETS) {
      const violations = validateBrandConfig(p.config);
      expect(violations, `${p.id}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });

  it('catches an obviously broken pairing', () => {
    const broken = structuredClone(DEFAULT_BRAND_CONFIG);
    broken.colors.light.primaryForeground = broken.colors.light.primary; // same colour
    const v = validateBrandConfig(broken);
    expect(v.some((x) => x.fg === 'primaryForeground' && x.bg === 'primary')).toBe(true);
  });
});

describe('resolve', () => {
  it('resolveCssVars maps the default light scale onto CSS var names', () => {
    const vars = resolveCssVars(DEFAULT_BRAND_CONFIG, 'light');
    expect(vars['--primary']).toBe(DEFAULT_LIGHT.primary);
    expect(vars['--card-foreground']).toBe(DEFAULT_LIGHT.cardForeground);
    expect(vars['--radius']).toBe('0.6rem');
    expect(vars['--font-sans']).toContain('Inter');
  });

  it('brandConfigToCss emits :root and .dark blocks with only dark diffs', () => {
    const css = brandConfigToCss(DEFAULT_BRAND_CONFIG);
    expect(css).toMatch(/:root \{[\s\S]*--primary: 222 74% 40%;[\s\S]*\}/);
    expect(css).toMatch(/\.dark \{[\s\S]*--primary: 213 84% 66%;/);
    // a token identical in both modes is not repeated under .dark
    expect(css.split('.dark {')[1]).not.toContain('--primary-foreground: 0 0% 100%');
    expect(DEFAULT_DARK.primaryForeground).not.toBe('0 0% 100%');
  });
});
