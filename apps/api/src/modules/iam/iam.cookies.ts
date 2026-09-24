import { randomBytes } from 'node:crypto';

import type { CookieOptions, Response } from 'express';

import {
  LEGACY_CSRF_COOKIE,
  LEGACY_REFRESH_COOKIE,
  csrfCookieName,
  refreshCookieName,
  type AuthAudience,
} from '../../common/security/refresh-cookie-name';
import type { Env } from '../../config/env.schema';

export { csrfCookieName, refreshCookieName, type AuthAudience };

/**
 * Browser refresh token: Secure, HttpOnly, SameSite=Lax on a shared origin (SRS-SEC-003) — or,
 * when `COOKIE_DOMAIN` is set, a shared *registrable domain* across sibling subdomains instead
 * (still same-site, so the same CSRF property holds; see COOKIE_DOMAIN's doc in env.schema.ts).
 * `Path=/api/v1/auth` limits where the cookie is sent. One cookie per audience (see
 * `refresh-cookie-name.ts`) so the ops dashboard and the customer site keep separate sessions.
 */
export function refreshCookieOptions(env: Env, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeMs,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(
  res: Response,
  env: Env,
  audience: AuthAudience,
  token: string,
  maxAgeMs: number,
): void {
  res.cookie(refreshCookieName(audience), token, refreshCookieOptions(env, maxAgeMs));
}

export function clearRefreshCookie(res: Response, env: Env, audience: AuthAudience): void {
  res.clearCookie(refreshCookieName(audience), {
    ...refreshCookieOptions(env, 0),
    maxAge: undefined,
  });
}

/**
 * The double-submit CSRF token (SRS-SEC-003 / CsrfGuard). Deliberately NOT `httpOnly` — the
 * client must be able to read it (`document.cookie`) to echo it back as `X-CSRF-Token`, which is
 * the whole point of the double-submit pattern: a cross-site page can make the browser *send* the
 * cookie automatically, but can't *read* it to put it in a header. `Path=/` (unlike the refresh
 * cookie) so it's actually visible to page JS everywhere, not just under `/api/v1/auth`.
 */
export function csrfCookieOptions(env: Env, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setCsrfCookie(
  res: Response,
  env: Env,
  audience: AuthAudience,
  maxAgeMs: number,
): void {
  res.cookie(
    csrfCookieName(audience),
    randomBytes(24).toString('base64url'),
    csrfCookieOptions(env, maxAgeMs),
  );
}

export function clearCsrfCookie(res: Response, env: Env, audience: AuthAudience): void {
  res.clearCookie(csrfCookieName(audience), { ...csrfCookieOptions(env, 0), maxAge: undefined });
}

/** Drop the pre-audience shared cookies so an upgraded browser doesn't carry a stale pair. */
export function clearLegacyCookies(res: Response, env: Env): void {
  res.clearCookie(LEGACY_REFRESH_COOKIE, { ...refreshCookieOptions(env, 0), maxAge: undefined });
  res.clearCookie(LEGACY_CSRF_COOKIE, { ...csrfCookieOptions(env, 0), maxAge: undefined });
}
