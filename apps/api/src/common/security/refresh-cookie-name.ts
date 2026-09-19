import type { Request } from 'express';

/**
 * The browser refresh/CSRF cookies are scoped **per audience** (`staff` = ops dashboard,
 * `customer` = public site / mobile). The site and `/ops` share one origin, so a single shared
 * cookie name would let a customer sign-in replace a staff session (and a customer sign-out end
 * it). Duplicated here so `common/` need not depend on `modules/iam`.
 */
export type AuthAudience = 'customer' | 'staff';

/** Request header the browser clients send on `/auth/*` so the API knows which cookie pair to use. */
export const AUDIENCE_HEADER = 'x-auth-audience';

export const refreshCookieName = (audience: AuthAudience): string => `carrental_rt_${audience}`;
export const csrfCookieName = (audience: AuthAudience): string => `carrental_csrf_${audience}`;

/** Pre-audience cookie names — only ever cleared (migration), never read. */
export const LEGACY_REFRESH_COOKIE = 'carrental_rt';
export const LEGACY_CSRF_COOKIE = 'carrental_csrf';

const isAudience = (v: unknown): v is AuthAudience => v === 'staff' || v === 'customer';

/**
 * Which surface is calling. The explicit header wins; without it, fall back to the only
 * audience cookie present (curl, older clients). Both cookies present and no header → `null`
 * (ambiguous — never guess which session to rotate).
 */
export function resolveAudience(req: Request): AuthAudience | null {
  const header = req.header(AUDIENCE_HEADER)?.toLowerCase();
  if (isAudience(header)) return header;
  const has = (['staff', 'customer'] as const).filter((a) =>
    Boolean(req.cookies?.[refreshCookieName(a)]),
  );
  return has.length === 1 ? has[0]! : null;
}
