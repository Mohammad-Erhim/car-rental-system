/**
 * Bespoke inline SVG illustration for the marketing pages. Inline (not files under /public) so
 * there are zero extra network requests, no 404 risk on the e2e console guards, and colours can
 * follow the theme via `currentColor` / CSS custom properties. All art is decorative:
 * `aria-hidden` and never the only carrier of meaning (FR-GBL-007).
 */
import type { SVGProps } from 'react';

/**
 * Full-bleed hero backdrop — a stylised "open road at dusk": gradient sky, sun glow on the
 * horizon, layered hills, a road converging to a vanishing point, and a scatter of stars.
 * Sits on the brand gradient in both themes, so the colours are token-driven with alpha.
 */
export function HeroScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="hero-sun" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="hsl(var(--hero-sun))" stopOpacity="0.8" />
          <stop offset="42%" stopColor="hsl(var(--hero-glow))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(var(--hero-glow))" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-road" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="hsl(var(--hero-road))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--hero-road))" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--hero-ink))" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(var(--hero-ink))" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <rect x="0" y="380" width="1600" height="520" fill="url(#hero-sun)" />

      <g fill="hsl(var(--hero-star))">
        {[
          [120, 90, 1.6],
          [280, 160, 1.1],
          [430, 70, 1.3],
          [610, 130, 1],
          [760, 80, 1.7],
          [910, 150, 1.1],
          [1080, 90, 1.3],
          [1240, 150, 1],
          [1380, 80, 1.6],
          [1500, 170, 1.2],
          [200, 240, 1],
          [1000, 250, 1.2],
          [1320, 250, 1],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} opacity={0.5 + (i % 3) * 0.15} />
        ))}
      </g>

      <path
        d="M0 560 C 240 500 380 540 620 520 C 900 496 1080 556 1600 512 L1600 900 L0 900 Z"
        fill="hsl(var(--hero-hill-1))"
        fillOpacity="0.75"
      />
      <path
        d="M0 636 C 300 588 520 628 820 604 C 1120 580 1360 632 1600 600 L1600 900 L0 900 Z"
        fill="hsl(var(--hero-hill-2))"
        fillOpacity="0.9"
      />

      <path d="M726 560 L874 560 L1180 900 L420 900 Z" fill="url(#hero-road)" />
      <g fill="hsl(var(--hero-star))" fillOpacity="0.85">
        <path d="M796 566 L804 566 L802 596 L798 596 Z" />
        <path d="M792 622 L808 622 L804 672 L796 672 Z" />
        <path d="M786 706 L814 706 L808 782 L792 782 Z" />
        <path d="M778 800 L822 800 L812 900 L788 900 Z" />
      </g>

      <rect x="0" y="0" width="1600" height="900" fill="url(#hero-fade)" />
    </svg>
  );
}

type CarVariant = 'economy' | 'compact' | 'intermediate' | 'suv' | 'premium' | 'van' | 'default';

interface CarSpec {
  /** solid body silhouette */
  body: string;
  /** brand-tinted window shapes */
  glass: string[];
  /** [frontCx, rearCx, radius] — wheels share a baseline of y=178 */
  wheels: [number, number, number];
}

const GLASS = 'hsl(var(--brand) / 0.5)';

/**
 * Side-profile car silhouettes, one per fleet class — deliberately distinct in length, roof
 * height and rear shape so the classes read apart at a glance. Solid fill (`currentColor`)
 * adapts to light/dark and to the panel behind it.
 */
export function CarArt({
  variant = 'default',
  className,
  ...props
}: { variant?: CarVariant; className?: string } & SVGProps<SVGSVGElement>) {
  const spec = CARS[variant] ?? CARS.default;
  const [fx, rx, r] = spec.wheels;
  return (
    <svg
      className={className}
      viewBox="0 0 480 220"
      fill="none"
      role="img"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={spec.body} fill="currentColor" fillOpacity="0.92" />
      {spec.glass.map((d, i) => (
        <path key={i} d={d} fill={GLASS} />
      ))}
      <g>
        <circle cx={fx} cy={178} r={r} fill="currentColor" />
        <circle cx={fx} cy={178} r={r * 0.44} fill="hsl(var(--surface))" />
        <circle cx={rx} cy={178} r={r} fill="currentColor" />
        <circle cx={rx} cy={178} r={r * 0.44} fill="hsl(var(--surface))" />
      </g>
    </svg>
  );
}

const CARS: Record<CarVariant, CarSpec> = {
  // small, stubby hatchback — tall greenhouse, steep hatch, short overhangs
  economy: {
    body: 'M96 182 C86 182 82 176 84 166 L92 138 C96 126 106 120 120 118 L150 86 C160 74 174 68 192 68 L262 68 C286 68 300 78 312 100 L344 122 C372 128 386 140 390 160 L392 172 C393 179 389 182 382 182 Z',
    glass: [
      'M150 118 L162 92 C168 80 180 76 194 76 L226 76 L226 118 Z',
      'M238 76 L258 76 C276 76 286 84 296 104 L238 118 Z',
    ],
    wheels: [140, 336, 27],
  },
  // longer hatch / small sedan — slight rear notch
  compact: {
    body: 'M78 184 C68 184 64 178 66 168 L74 138 C78 124 90 118 106 116 L146 82 C158 70 174 64 194 64 L300 64 C326 64 344 76 356 100 L400 122 C428 130 440 142 444 162 L446 174 C447 181 443 184 436 184 Z',
    glass: [
      'M146 116 L160 88 C166 76 178 72 194 72 L232 72 L232 116 Z',
      'M244 72 L288 72 C308 72 320 82 332 106 L244 116 Z',
    ],
    wheels: [136, 356, 28],
  },
  // three-box sedan — long body, distinct trunk deck at the rear
  intermediate: {
    body: 'M52 184 C42 184 38 178 40 168 L46 140 C50 126 62 120 80 118 L150 84 C164 72 182 66 206 66 L300 66 C330 66 350 80 362 104 L438 120 C462 128 470 142 472 164 L472 176 C473 183 469 184 462 184 Z',
    glass: [
      'M156 116 L172 90 C180 78 194 74 214 74 L256 74 L256 116 Z',
      'M268 74 L300 74 C322 74 338 86 350 110 L268 116 Z',
    ],
    wheels: [128, 372, 28],
  },
  // tall, boxy SUV — high near-vertical glass, roof rails, raised ride height, big wheels
  suv: {
    body: 'M56 176 C46 176 42 170 44 160 L50 128 C54 112 66 104 84 102 L104 60 C112 46 128 40 150 40 L338 40 C368 40 388 52 400 78 L430 108 C458 116 468 132 470 158 L470 170 C471 177 467 176 460 176 Z',
    glass: [
      'M118 100 L132 66 C138 54 152 50 172 50 L236 50 L236 100 Z',
      'M248 50 L326 50 C346 50 360 60 372 100 L248 100 Z',
    ],
    wheels: [126, 372, 33],
  },
  // long, low, sleek — long hood, fastback roofline into a short rear deck
  premium: {
    body: 'M28 180 C20 180 18 174 20 166 L26 148 C30 134 44 126 64 122 L150 92 C176 80 206 70 244 68 L330 62 C368 60 396 74 410 106 L456 124 C480 134 484 148 484 168 L484 176 C484 182 480 180 474 180 Z',
    glass: [
      'M164 118 C184 96 214 84 250 82 L296 80 L288 118 Z',
      'M300 80 L332 78 C356 78 372 90 384 116 L300 118 Z',
    ],
    wheels: [116, 388, 29],
  },
  // tall, long, flat-front panel van — two big side windows
  van: {
    body: 'M44 182 C36 182 34 176 34 168 L36 96 C38 70 52 56 78 54 L354 54 C388 54 410 66 424 94 L452 122 C474 132 480 148 480 170 L480 178 C480 182 476 182 470 182 Z',
    glass: ['M96 82 L206 82 L206 122 L92 122 Z', 'M222 82 L318 82 L318 122 L222 122 Z'],
    wheels: [120, 388, 30],
  },
  default: {
    body: 'M78 184 C68 184 64 178 66 168 L74 138 C78 124 90 118 106 116 L146 82 C158 70 174 64 194 64 L300 64 C326 64 344 76 356 100 L400 122 C428 130 440 142 444 162 L446 174 C447 181 443 184 436 184 Z',
    glass: [
      'M146 116 L160 88 C166 76 178 72 194 72 L232 72 L232 116 Z',
      'M244 72 L288 72 C308 72 320 82 332 106 L244 116 Z',
    ],
    wheels: [136, 356, 28],
  },
};

const KNOWN_VARIANTS = new Set<CarVariant>([
  'economy',
  'compact',
  'intermediate',
  'suv',
  'premium',
  'van',
]);

/** Map a fleet category code to the closest car silhouette, falling back to a generic one. */
export function carVariantFor(code: string): CarVariant {
  return KNOWN_VARIANTS.has(code as CarVariant) ? (code as CarVariant) : 'default';
}

/** Dotted connector used behind the "how it works" steps. */
export function RouteDots({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1000 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <line
        x1="8"
        y1="10"
        x2="992"
        y2="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
    </svg>
  );
}
