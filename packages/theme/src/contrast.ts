/**
 * WCAG 2.1 relative-luminance + contrast-ratio maths, working directly on the `"H S% L%"`
 * token strings. Used by `validateBrandConfig` and the `verify:theme` gate to guarantee the
 * seeded presets stay AA in both modes.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `"222 74% 40%"` → {h,s,l} (h in deg, s/l in 0..1). Throws on a malformed value. */
export function parseHslTriple(value: string): { h: number; s: number; l: number } {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
  if (!m) throw new Error(`not an "H S% L%" triple: ${JSON.stringify(value)}`);
  return { h: Number(m[1]), s: Number(m[2]) / 100, l: Number(m[3]) / 100 };
}

export function hslTripleToRgb(value: string): Rgb {
  const { h, s, l } = parseHslTriple(value);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function channelLuminance(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio (1..21) between two `"H S% L%"` triples. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hslTripleToRgb(a));
  const lb = relativeLuminance(hslTripleToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
