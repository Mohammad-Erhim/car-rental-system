import { COLOR_TOKENS, RADII, type ColorScale, type ColorToken, type RadiusKey } from '@carrental/theme';

/** `"H S% L%"` (CSS Color 4 space syntax, as `@carrental/theme` stores it) -> `"hsl(H, S%, L%)"`
 *  (comma syntax) — React Native's color parser (`@react-native/normalize-colors`) accepts the
 *  comma form across every RN version we target; the space form is a newer CSS addition it
 *  doesn't reliably parse yet. No RGB math needed — same token, same value, just re-punctuated. */
export function hslTripleToRNColor(triple: string): string {
  const [h, s, l] = triple.trim().split(/\s+/);
  return `hsl(${h}, ${s}, ${l})`;
}

/** Applies alpha to a resolved `"hsl(h, s%, l%)"` token color. Appending a hex alpha suffix (the
 *  web apps' Tailwind-style `${hexColor}33` trick) doesn't work here — these are `hsl()` strings,
 *  not hex, and RN's color parser silently ignores the trailing characters rather than erroring,
 *  so the color renders fully opaque instead of translucent (e.g. a white badge pill loses its
 *  tint entirely and swallows same-color text). Use this wherever a token needs partial opacity. */
export function withAlpha(rnColor: string, alpha: number): string {
  const match = /^hsl\(([^)]+)\)$/.exec(rnColor);
  if (!match) return rnColor;
  return `hsla(${match[1]}, ${alpha})`;
}

/** Converts a resolved `"hsl(h, s%, l%)"` token color to `"#rrggbb"`. Needed for native props that
 *  bypass RN's own color pipeline and parse the string themselves — e.g. `@stripe/stripe-react-native`'s
 *  `CardField` `cardStyle` (unlike `style`, RN never runs this one through `processColor`/
 *  `normalize-colors`; Stripe's own iOS/Android color parsers accept hex only, not `hsl()`, and fail
 *  silently to a native default rather than erroring — on iOS that default renders solid black). */
export function toHexColor(rnColor: string): string {
  const match = /^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(rnColor);
  if (!match) return rnColor;
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toByte = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export type RNColorScale = Record<ColorToken, string>;

export function resolveRNColors(scale: ColorScale): RNColorScale {
  const out = {} as RNColorScale;
  for (const token of COLOR_TOKENS) out[token] = hslTripleToRNColor(scale[token]);
  return out;
}

/** A modal/sheet backdrop dimmer — deliberately fixed, not a theme token: a scrim reads the same
 *  in light and dark mode (it dims *content*, not surface chrome), the same way most design
 *  systems hardcode this rather than deriving it from brand colors. */
export const MODAL_SCRIM = 'rgba(0, 0, 0, 0.4)';

const REM_PX = 16;

/** `RADII` values are CSS `rem` strings (e.g. `"0.6rem"`) — RN needs plain numbers. Not money —
 *  the repo-wide "no parseFloat" rule is about currency amounts (SRS-DAT-003); this parses a
 *  design-token length, where trimming the trailing unit is exactly what's needed. */
export function radiusPx(key: RadiusKey): number {
  // eslint-disable-next-line no-restricted-syntax -- CSS length string, not money
  const rem = parseFloat(RADII[key]);
  return Math.round(rem * REM_PX);
}

/** 4px base spacing scale — shared across every screen so paddings/gaps stay consistent
 *  (a hand-rolled equivalent of the web apps' Tailwind spacing scale). */
export const space = (n: number): number => n * 4;

export const typography = {
  display: { fontSize: 32, lineHeight: 39, fontWeight: '700' as const },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const },
  h2: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
};
export type TypographyKey = keyof typeof typography;

/** Shape of the floating pill bottom-tab-bar (see `(tabs)/_layout.tsx`). Exported as one source
 *  of truth because every tab screen with scrolling/list content needs to reserve clearance
 *  (`FLOATING_TAB_BAR.height + bottomMargin + buffer`) so its last item doesn't render underneath
 *  the bar — an absolutely-positioned tab bar takes no space in the navigator's own layout, unlike
 *  a docked one. */
export const FLOATING_TAB_BAR = {
  height: 64,
  bottomMargin: 16,
  horizontalMargin: 16,
  radius: 28,
  /** Total space a screen should clear above its own safe-area inset. */
  get contentClearance() {
    return this.height + this.bottomMargin + 16;
  },
};
