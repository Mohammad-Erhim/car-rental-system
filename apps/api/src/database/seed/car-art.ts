/**
 * Renders the same on-brand car silhouette art `apps/site` uses as its fallback (see
 * `apps/site/src/components/marketing/art.tsx`'s `CarArt`/`CARS`) to a flat PNG, so a fresh dev
 * install has *something* real sitting in object storage under each vehicle category's
 * `imageRef` instead of starting completely empty. Path data is intentionally mirrored from that
 * file (design data, not logic) — update both together if the illustrations change.
 *
 * Zero image-library dependency, matching this codebase's object-storage stack (DEC-015,
 * `common/object-storage/image.util.ts`'s own "no sharp/file-type" convention) and the same
 * hand-rolled PNG-encoder technique `apps/mobile`'s placeholder-asset generator uses: a minimal
 * SVG path parser + cubic-bezier flattening + scanline polygon fill + zlib-deflate PNG writer.
 * Renders at 2x and box-downsamples for basic anti-aliasing.
 */
import { deflateSync } from 'node:zlib';

export type CarVariant = 'economy' | 'compact' | 'intermediate' | 'suv' | 'premium' | 'van';

interface CarSpec {
  body: string;
  glass: string[];
  wheels: [number, number, number];
}

// Mirrored verbatim from apps/site/src/components/marketing/art.tsx's `CARS` (minus `default`,
// which nothing in the seed data needs — every seeded category code has a matching variant).
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
};

const VIEWBOX_W = 480;
const VIEWBOX_H = 220;
/** Final PNG is this × 2 (viewBox scale) × 2 (supersample) = 4x, downsampled by 2 for AA. */
const SCALE = 2;
const SUPERSAMPLE = 2;

// ---- HSL -> RGB (same conversion apps/mobile's theme layer uses, reimplemented here since a
// seed script in apps/api has no reason to depend on @carrental/theme's package build). ----
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Brand primary (packages/theme DEFAULT_LIGHT.primary = '158 82% 26%') and its foreground
// ('0 0% 100%' = white) — kept as literals rather than importing @carrental/theme's *built*
// package into a pre-build seed script; update alongside packages/theme/src/tokens.ts if the
// shipped default brand ever changes.
const BG_TOP = hslToRgb(158, 82, 34); // lighter tint for a subtle top-to-bottom gradient
const BG_BOTTOM = hslToRgb(158, 82, 24);
const BODY_COLOR: [number, number, number] = [255, 255, 255];
// The original SVG's glass is brand-colored at 50% opacity *over the white body*
// (`hsl(var(--brand) / 0.5)`) — i.e. the window should read as a tinted cutout in the white
// silhouette, not "more white on white" (which is a no-op blend and was invisible).
const GLASS_COLOR = hslToRgb(158, 82, 26);

type Point = [number, number];

/** Flattens `M`/`L`/`C`/`Z` path commands (the only ones this art uses) into polygons. */
function parsePath(d: string): Point[][] {
  const tokens = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  const next = () => Number(tokens[i++]);
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      if (current.length) polygons.push(current);
      cx = next();
      cy = next();
      startX = cx;
      startY = cy;
      current = [[cx, cy]];
    } else if (cmd === 'L') {
      cx = next();
      cy = next();
      current.push([cx, cy]);
    } else if (cmd === 'C') {
      const x1 = next();
      const y1 = next();
      const x2 = next();
      const y2 = next();
      const x = next();
      const y = next();
      const steps = 20;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const px = mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
        const py = mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
        current.push([px, py]);
      }
      cx = x;
      cy = y;
    } else if (cmd === 'Z') {
      current.push([startX, startY]);
      polygons.push(current);
      current = [];
    }
  }
  if (current.length) polygons.push(current);
  return polygons;
}

/** Nonzero-winding scanline fill across one or more (possibly disjoint) polygons. */
function fillPolygons(
  polygons: Point[][],
  width: number,
  height: number,
  plot: (x: number, y: number) => void,
) {
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number; dir: 1 | -1 }> = [];
  for (const poly of polygons) {
    for (let j = 0; j < poly.length; j++) {
      const [x1, y1] = poly[j]!;
      const [x2, y2] = poly[(j + 1) % poly.length]!;
      if (y1 === y2) continue;
      edges.push(
        y1 < y2 ? { x1, y1, x2, y2, dir: 1 } : { x1: x2, y1: y2, x2: x1, y2: y1, dir: -1 },
      );
    }
  }
  if (!edges.length) return;
  const minY = Math.max(0, Math.floor(Math.min(...edges.map((e) => e.y1))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...edges.map((e) => e.y2))));
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5;
    const crossings: Array<[number, 1 | -1]> = [];
    for (const e of edges) {
      if (yc < e.y1 || yc >= e.y2) continue;
      const t = (yc - e.y1) / (e.y2 - e.y1);
      crossings.push([e.x1 + t * (e.x2 - e.x1), e.dir]);
    }
    crossings.sort((a, b) => a[0] - b[0]);
    let wind = 0;
    let spanStart: number | null = null;
    for (const [x, dir] of crossings) {
      const before = wind;
      wind += dir;
      if (before === 0 && wind !== 0) spanStart = x;
      else if (before !== 0 && wind === 0 && spanStart !== null) {
        const x0 = Math.max(0, Math.round(spanStart));
        const x1e = Math.min(width, Math.round(x));
        for (let x2 = x0; x2 < x1e; x2++) plot(x2, y);
        spanStart = null;
      }
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, plot: (x: number, y: number) => void) {
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) plot(x, y);
    }
  }
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Renders one category-class illustration as a PNG buffer (RGBA, no external dependency). */
export function renderCarArtPng(variant: CarVariant): Buffer {
  const spec = CARS[variant];
  const outW = VIEWBOX_W * SCALE;
  const outH = VIEWBOX_H * SCALE;
  const w = outW * SUPERSAMPLE;
  const h = outH * SUPERSAMPLE;
  const scale = SCALE * SUPERSAMPLE;

  // RGBA framebuffer, pre-filled with the vertical brand-tinted gradient background.
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = mix(BG_TOP[0], BG_BOTTOM[0], t);
    const g = mix(BG_TOP[1], BG_BOTTOM[1], t);
    const b = mix(BG_TOP[2], BG_BOTTOM[2], t);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }

  const blend = (x: number, y: number, color: [number, number, number], alpha: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const o = (y * w + x) * 4;
    px[o] = mix(px[o]!, color[0], alpha);
    px[o + 1] = mix(px[o + 1]!, color[1], alpha);
    px[o + 2] = mix(px[o + 2]!, color[2], alpha);
  };

  const toDevice = (poly: Point[][]): Point[][] =>
    poly.map((sub) => sub.map(([x, y]) => [x * scale, y * scale] as Point));

  // Body — solid white silhouette.
  fillPolygons(toDevice(parsePath(spec.body)), w, h, (x, y) => blend(x, y, BODY_COLOR, 1));
  // Glass — brand-colored tint blended over the white body (mirrors the original SVG's
  // `hsl(var(--brand) / 0.5)` glass sitting on top of `currentColor`'s white body fill).
  for (const g of spec.glass) {
    fillPolygons(toDevice(parsePath(g)), w, h, (x, y) => blend(x, y, GLASS_COLOR, 0.55));
  }
  // Wheels — solid tire + a hub that shows the gradient through (a "cutout"), same silhouette
  // the SVG uses (tire = currentColor, hub = surface color) minus the extra literal surface tone.
  const [fx, rx, r] = spec.wheels;
  for (const cx of [fx, rx]) {
    fillCircle(cx * scale, 178 * scale, r * scale, (x, y) => blend(x, y, BODY_COLOR, 1));
    fillCircle(cx * scale, 178 * scale, r * scale * 0.42, (x, y) => {
      // punch the hub back down toward the gradient color already under it (undo most of the
      // white fill) rather than a flat fill, so the gradient still reads through the hub.
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const t = y / (h - 1);
      const gr = mix(BG_TOP[0], BG_BOTTOM[0], t);
      const gg = mix(BG_TOP[1], BG_BOTTOM[1], t);
      const gb = mix(BG_TOP[2], BG_BOTTOM[2], t);
      blend(x, y, [gr, gg, gb], 1);
    });
  }

  // Box-downsample SUPERSAMPLE x SUPERSAMPLE -> final resolution (cheap anti-aliasing).
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      const n = SUPERSAMPLE * SUPERSAMPLE;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const o = ((oy * SUPERSAMPLE + sy) * w + (ox * SUPERSAMPLE + sx)) * 4;
          r += px[o]!;
          g += px[o + 1]!;
          b += px[o + 2]!;
        }
      }
      const oo = (oy * outW + ox) * 4;
      out[oo] = Math.round(r / n);
      out[oo + 1] = Math.round(g / n);
      out[oo + 2] = Math.round(b / n);
      out[oo + 3] = 255;
    }
  }

  return encodePng(outW, outH, out);
}

// ---- Minimal PNG encoder (RGBA, filter 0, zlib deflate) — no dependency. ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const ihdr = chunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.subarray(y * stride, (y + 1) * stride).forEach((v, idx) => {
      raw[rowStart + 1 + idx] = v;
    });
  }
  const idat = chunk('IDAT', deflateSync(Buffer.from(raw), { level: 9 }));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}
