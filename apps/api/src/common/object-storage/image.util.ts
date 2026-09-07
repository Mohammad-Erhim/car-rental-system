/**
 * Dependency-free image inspection + SVG hardening for brand-asset uploads (DEC-025, STAGE-009).
 * No `sharp` / `file-type` — small header readers cover the four raster formats we accept, and
 * a conservative allowlist sanitiser covers SVG.
 */

export const BRAND_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
] as const;
export type BrandMediaType = (typeof BRAND_MEDIA_TYPES)[number];

/** Magic-byte sniff. Returns the media type or `null` when the bytes match nothing we accept. */
export function sniffMediaType(buf: Buffer): BrandMediaType | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // WEBP: "RIFF"...."WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  // ICO: 00 00 01 00
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00)
    return 'image/x-icon';
  // SVG: XML/`<svg` within the first bytes (skip BOM / whitespace)
  const head = buf
    .toString('utf8', 0, Math.min(buf.length, 512))
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || /<svg[\s>]/i.test(head))
    return 'image/svg+xml';
  return null;
}

export interface Dimensions {
  width: number;
  height: number;
}

/** Pixel dimensions for a raster buffer, or `null` if they can't be read (e.g. SVG). */
export function rasterDimensions(buf: Buffer, mediaType: BrandMediaType): Dimensions | null {
  try {
    if (mediaType === 'image/png') {
      // IHDR width/height are big-endian u32 at offset 16 / 20
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mediaType === 'image/x-icon') {
      // first ICONDIRENTRY at offset 6: width, height bytes (0 → 256)
      return { width: buf[6] || 256, height: buf[7] || 256 };
    }
    if (mediaType === 'image/webp') {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fmt === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (fmt === 'VP8X') {
        if (buf.length < 30) return null;
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      }
      return null;
    }
    if (mediaType === 'image/jpeg') {
      let o = 2;
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) {
          o++;
          continue;
        }
        const marker = buf[o + 1]!;
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry the frame size
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Conservative SVG sanitiser: removes scripting, external references, embedded stylesheets that
 * could load resources, entity/DOCTYPE declarations, and every `on*` handler attribute. Returns
 * the cleaned markup; throws when the root element is not `<svg>`.
 */
export function sanitizeSvg(input: string): string {
  let s = input.replace(/^\uFEFF/, '');
  // strip DOCTYPE / ENTITY (XXE) and processing instructions other than the xml prolog
  s = s.replace(/<!DOCTYPE[^>]*>/gi, '');
  s = s.replace(/<!ENTITY[^>]*>/gi, '');
  s = s.replace(/<\?(?!xml)[\s\S]*?\?>/gi, '');
  // drop dangerous elements wholesale (open+close and self-closing)
  const BANNED = [
    'script',
    'foreignObject',
    'style',
    'iframe',
    'embed',
    'object',
    'audio',
    'video',
    'animate',
    'animateTransform',
    'animateMotion',
    'set',
    'handler',
    'listener',
  ];
  for (const tag of BANNED) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    s = s.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }
  // remove on*="" handlers
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // neutralise javascript: / data: (non-image) / external URLs in href / xlink:href / src
  s = s.replace(/\s(?:xlink:href|href|src)\s*=\s*("[^"]*"|'[^']*')/gi, (m: string, v: string) => {
    const val = v.slice(1, -1).trim().toLowerCase();
    const ok =
      val.startsWith('#') ||
      val.startsWith('data:image/png') ||
      val.startsWith('data:image/jpeg') ||
      val.startsWith('data:image/webp') ||
      val.startsWith('data:image/gif');
    return ok ? m : '';
  });
  // strip url(...) that points off-document (CSS in presentation attributes)
  s = s.replace(/url\(\s*['"]?\s*(?:https?:|\/\/)[^)]*\)/gi, 'none');
  if (!/<svg[\s>]/i.test(s)) throw new Error('not an <svg> document');
  return s.trim();
}
