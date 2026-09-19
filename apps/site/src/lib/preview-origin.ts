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

/** The origin to address the parent with: its own (from the referrer) when allowed, else this origin. */
export function previewParentOrigin(referrer: string, self: string): string {
  try {
    const ref = new URL(referrer).origin;
    if (isAllowedPreviewOrigin(ref, self)) return ref;
  } catch {
    /* no usable referrer */
  }
  return self;
}
