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

/* ---- hex <-> "H S% L%" (for the dashboard colour inputs) ---------------------------------- */

function rgbToHslTriple({ r, g, b }: Rgb): string {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r1:
        h = ((g1 - b1) / d) % 6;
        break;
      case g1:
        h = (b1 - r1) / d + 2;
        break;
      default:
        h = (r1 - g1) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** `#3b82f6` (or `#fff`) → `"217 91% 60%"`. Returns null for a malformed hex. */
export function hexToHslTriple(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  return rgbToHslTriple({
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  });
}

/** `"217 91% 60%"` → `#3b82f6` (for `<input type="color">` value binding). */
export function hslTripleToHex(triple: string): string {
  const { r, g, b } = hslTripleToRgb(triple);
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
