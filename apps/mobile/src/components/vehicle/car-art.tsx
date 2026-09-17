import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '../../lib/theme/theme-provider';

type CarVariant = 'economy' | 'compact' | 'intermediate' | 'suv' | 'premium' | 'van' | 'default';

interface CarSpec {
  body: string;
  glass: string[];
  wheels: [number, number, number];
}

export function carVariantFor(code: string): CarVariant {
  return KNOWN_VARIANTS.has(code as CarVariant) ? (code as CarVariant) : 'default';
}

export function CarArt({
  code,
  width = 220,
  height = 112,
  color,
}: {
  code: string;
  width?: number | string;
  height?: number | string;
  color?: string;
}) {
  const { colors } = useTheme();
  const spec = CARS[carVariantFor(code)];
  const [frontX, rearX, wheelR] = spec.wheels;
  const bodyColor = color ?? colors.primaryForeground;
  // SVG gradient/mask ids are looked up in a single document-wide namespace on Android — with
  // several CarArt instances on one screen (the "choose your fleet" strip, a search-results list)
  // a shared literal id would make every instance paint whichever gradient happened to be defined
  // last. `useId()` gives each instance its own id, once, without re-generating on every render.
  const gradientId = `carArtBody-${useId()}`;

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 28 490 190"
      fill="none"
      accessibilityElementsHidden
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bodyColor} stopOpacity={1} />
          <Stop offset="1" stopColor={bodyColor} stopOpacity={0.8} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={(frontX + rearX) / 2} cy={196} rx={(rearX - frontX) / 2 + 36} ry={10} fill="#000000" opacity={0.12} />
      <Path d={spec.body} fill={`url(#${gradientId})`} />
      {spec.glass.map((d, index) => (
        <Path key={index} d={d} fill={colors.primary} fillOpacity={0.4} />
      ))}
      <Circle cx={frontX} cy={178} r={wheelR} fill={bodyColor} fillOpacity={0.85} />
      <Circle cx={frontX} cy={178} r={wheelR * 0.44} fill={colors.card} />
      <Circle cx={rearX} cy={178} r={wheelR} fill={bodyColor} fillOpacity={0.85} />
      <Circle cx={rearX} cy={178} r={wheelR * 0.44} fill={colors.card} />
    </Svg>
  );
}

const CARS: Record<CarVariant, CarSpec> = {
  economy: {
    body: 'M96 182 C86 182 82 176 84 166 L92 138 C96 126 106 120 120 118 L150 86 C160 74 174 68 192 68 L262 68 C286 68 300 78 312 100 L344 122 C372 128 386 140 390 160 L392 172 C393 179 389 182 382 182 Z',
    glass: [
      'M150 118 L162 92 C168 80 180 76 194 76 L226 76 L226 118 Z',
      'M238 76 L258 76 C276 76 286 84 296 104 L238 118 Z',
    ],
    wheels: [140, 336, 27],
  },
  compact: {
    body: 'M78 184 C68 184 64 178 66 168 L74 138 C78 124 90 118 106 116 L146 82 C158 70 174 64 194 64 L300 64 C326 64 344 76 356 100 L400 122 C428 130 440 142 444 162 L446 174 C447 181 443 184 436 184 Z',
    glass: [
      'M146 116 L160 88 C166 76 178 72 194 72 L232 72 L232 116 Z',
      'M244 72 L288 72 C308 72 320 82 332 106 L244 116 Z',
    ],
    wheels: [136, 356, 28],
  },
  intermediate: {
    body: 'M52 184 C42 184 38 178 40 168 L46 140 C50 126 62 120 80 118 L150 84 C164 72 182 66 206 66 L300 66 C330 66 350 80 362 104 L438 120 C462 128 470 142 472 164 L472 176 C473 183 469 184 462 184 Z',
    glass: [
      'M156 116 L172 90 C180 78 194 74 214 74 L256 74 L256 116 Z',
      'M268 74 L300 74 C322 74 338 86 350 110 L268 116 Z',
    ],
    wheels: [128, 372, 28],
  },
  suv: {
    body: 'M56 176 C46 176 42 170 44 160 L50 128 C54 112 66 104 84 102 L104 60 C112 46 128 40 150 40 L338 40 C368 40 388 52 400 78 L430 108 C458 116 468 132 470 158 L470 170 C471 177 467 176 460 176 Z',
    glass: [
      'M118 100 L132 66 C138 54 152 50 172 50 L236 50 L236 100 Z',
      'M248 50 L326 50 C346 50 360 60 372 100 L248 100 Z',
    ],
    wheels: [126, 372, 33],
  },
  premium: {
    body: 'M28 180 C20 180 18 174 20 166 L26 148 C30 134 44 126 64 122 L150 92 C176 80 206 70 244 68 L330 62 C368 60 396 74 410 106 L456 124 C480 134 484 148 484 168 L484 176 C484 182 480 180 474 180 Z',
    glass: [
      'M164 118 C184 96 214 84 250 82 L296 80 L288 118 Z',
      'M300 80 L332 78 C356 78 372 90 384 116 L300 118 Z',
    ],
    wheels: [116, 388, 29],
  },
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
