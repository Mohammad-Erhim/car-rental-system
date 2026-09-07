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
