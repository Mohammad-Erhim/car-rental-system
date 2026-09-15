#!/usr/bin/env node
/**
 * Generates minimal-but-valid placeholder app icons/splash art from the shared brand primary
 * color (`@carrental/theme` DEFAULT_LIGHT.primary), so the app has something real to build with
 * before design hands off final artwork. Zero image-library dependency: hand-rolled PNG encoder
 * (RGBA, filter 0, zlib deflate) — good enough for flat-color placeholder shapes.
 *
 * Replace every file this writes with real designed assets before a store submission.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../assets');

// Brand primary, hsl(158, 82%, 26%) -> rgb, kept in sync with packages/theme DEFAULT_LIGHT.primary.
const BRAND = { r: 12, g: 121, b: 81 };
const BRAND_DARK_BG = { r: 11, g: 20, b: 32 }; // matches app.config.ts splash.dark.backgroundColor

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** pixelFn(x, y) -> [r, g, b, a] (0-255 each). Always RGBA (color type 6). */
function makePng(width, height, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }
  const idat = chunk('IDAT', deflateSync(raw, { level: 9 }));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function solid(width, height, { r, g, b }, a = 255) {
  return makePng(width, height, () => [r, g, b, a]);
}

/** Flat color square with a centered white rounded-square "mark" — a stand-in wordmark-free logo. */
function markOnSolid(size, bg, markColor = { r: 255, g: 255, b: 255 }) {
  const markSize = Math.round(size * 0.46);
  const radius = Math.round(markSize * 0.28);
  const x0 = (size - markSize) / 2;
  const y0 = (size - markSize) / 2;
  const x1 = x0 + markSize;
  const y1 = y0 + markSize;

  const insideRoundedRect = (x, y) => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
    const cx = x < x0 + radius ? x0 + radius : x >= x1 - radius ? x1 - radius : x;
    const cy = y < y0 + radius ? y0 + radius : y >= y1 - radius ? y1 - radius : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius || (x >= x0 + radius && x < x1 - radius);
  };

  return makePng(size, size, (x, y) => {
    if (insideRoundedRect(x, y)) return [markColor.r, markColor.g, markColor.b, 255];
    return [bg.r, bg.g, bg.b, 255];
  });
}

/** Transparent background, white rounded-square mark only — for adaptive icon fg / notif icon. */
function markOnTransparent(size, markColor = { r: 255, g: 255, b: 255 }) {
  const markSize = Math.round(size * 0.5);
  const radius = Math.round(markSize * 0.28);
  const x0 = (size - markSize) / 2;
  const y0 = (size - markSize) / 2;
  const x1 = x0 + markSize;
  const y1 = y0 + markSize;

  const insideRoundedRect = (x, y) => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
    const cx = x < x0 + radius ? x0 + radius : x >= x1 - radius ? x1 - radius : x;
    const cy = y < y0 + radius ? y0 + radius : y >= y1 - radius ? y1 - radius : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius || (x >= x0 + radius && x < x1 - radius);
  };

  return makePng(size, size, (x, y) =>
    insideRoundedRect(x, y) ? [markColor.r, markColor.g, markColor.b, 255] : [0, 0, 0, 0],
  );
}

const files = {
  'icon.png': markOnSolid(1024, BRAND),
  'adaptive-icon.png': markOnTransparent(1024),
  'splash.png': markOnTransparent(600),
  'favicon.png': solid(48, 48, BRAND),
  'notification-icon.png': markOnTransparent(96),
};

for (const [name, buf] of Object.entries(files)) {
  writeFileSync(path.join(OUT, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}

void BRAND_DARK_BG;
