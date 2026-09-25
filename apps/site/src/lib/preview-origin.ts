/**
 * Which origins may drive the live preview (`?preview=1`) from a parent page. Same origin always
 * (the single-origin setup, where the site proxies `/ops`). In development the dashboard's own
 * dev server (`:3100`) is allowed too, and `NEXT_PUBLIC_PREVIEW_PARENT_ORIGINS` (comma separated)
 * adds more. Anything else is ignored, so an arbitrary page can't push content into the preview.
 */
const EXTRA = [
  ...(process.env.NEXT_PUBLIC_PREVIEW_PARENT_ORIGINS ?? '').split(','),
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3100']),
]
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

export function isAllowedPreviewOrigin(origin: string, self: string): boolean {
  return origin === self || EXTRA.includes(origin);
}

/**
 * The origin to address the parent with: its own (from the referrer) when allowed, else the
 * configured dashboard origin, else this origin as a last resort.
 *
 * `self` is only a correct fallback when the parent and this page share an origin (the
 * single-origin setup) — every response header on this deploy sets `Referrer-Policy: no-referrer`
 * (nginx.edge.conf), so `document.referrer` is always empty for a real embed, and this always hit
 * the fallback. Addressing the parent as `self` there sends the handshake to the wrong window;
 * the browser silently drops it ("target origin does not match the recipient window's origin"),
 * the parent's `ready` flag never flips, and every edit after that is a no-op with nothing logged
 * to explain why (verified live: the page builder's preview pane never updates). The first
 * configured `NEXT_PUBLIC_PREVIEW_PARENT_ORIGINS` entry is the actual dashboard in that setup, so
 * try it before giving up and addressing `self`.
 */
export function previewParentOrigin(referrer: string, self: string): string {
  try {
    const ref = new URL(referrer).origin;
    if (isAllowedPreviewOrigin(ref, self)) return ref;
  } catch {
    /* no usable referrer */
  }
  return EXTRA[0] ?? self;
}
