import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { AppError } from '../app-error';

import { CSRF_COOKIE, REFRESH_COOKIE } from './refresh-cookie-name';

/**
 * SRS-SEC-003 — CSRF defense for cookie-authenticated writes (`POST /auth/refresh`,
 * `POST /auth/sign-out`). Those are the only endpoints that act on the browser's
 * `HttpOnly; SameSite=Lax; Path=/api/v1/auth` refresh cookie.
 *
 * Enforcement: when the request carries the refresh cookie, it must ALSO clear one of two bars —
 * a verified-allowed `Origin`/`Referer`, or a double-submit `X-CSRF-Token` header matching the
 * non-HttpOnly `carrental_csrf` cookie (`@carrental/client` sets this on every mutating request).
 * A request with neither header at all no longer passes by default — that previously treated a
 * request with no Origin/Referer as trivially "same-origin," which is exactly the shape a
 * same-site-cookie-riding but cross-origin-fetch-avoiding attack would take. A request with no
 * refresh cookie at all (a same-origin XHR authenticated by bearer token, or a non-browser client)
 * still passes untouched — there is nothing cookie-authed here for CSRF to protect.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const hasRefreshCookie = Boolean(req.cookies?.[REFRESH_COOKIE]);
    if (!hasRefreshCookie) return true; // nothing cookie-authed to protect

    const origin = originOf(req);
    const originAllowed = origin !== null && this.env.CORS_ALLOWED_ORIGINS.includes(origin);
    if (!originAllowed) {
      // double-submit fallback: header token must equal the readable csrf cookie. Also the ONLY
      // path when neither Origin nor Referer was sent at all — that used to short-circuit the
      // whole check (`if (origin && ...)`), silently trusting any request with both headers
      // stripped instead of requiring the token the way a genuinely cross-site request would.
      const header = req.header('x-csrf-token');
      const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
      if (!header || !cookie || header !== cookie) {
        throw new AppError('forbidden', { title: 'Cross-site request blocked' });
      }
    }
    return true;
  }
}

function originOf(req: Request): string | null {
  const origin = req.header('origin');
  if (origin) return origin;
  const referer = req.header('referer');
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  }
  return null;
}
