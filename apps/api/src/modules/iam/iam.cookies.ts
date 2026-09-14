import { randomBytes } from 'node:crypto';

import type { CookieOptions, Response } from 'express';

import type { Env } from '../../config/env.schema';

export const REFRESH_COOKIE = 'carrental_rt';
export const CSRF_COOKIE = 'carrental_csrf';

/**
 * Browser refresh token: Secure, HttpOnly, SameSite=Lax on a shared origin (SRS-SEC-003).
 * `Path=/api/v1/auth` limits where the cookie is sent.
 */
export function refreshCookieOptions(env: Env, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(res: Response, env: Env, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(env, maxAgeMs));
}

export function clearRefreshCookie(res: Response, env: Env): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(env, 0), maxAge: undefined });
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
  };
}

export function setCsrfCookie(res: Response, env: Env, maxAgeMs: number): void {
  res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), csrfCookieOptions(env, maxAgeMs));
}

export function clearCsrfCookie(res: Response, env: Env): void {
  res.clearCookie(CSRF_COOKIE, { ...csrfCookieOptions(env, 0), maxAge: undefined });
}
