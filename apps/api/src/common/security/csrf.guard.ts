import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { AppError } from '../app-error';

import { REFRESH_COOKIE } from './refresh-cookie-name';

/**
 * SRS-SEC-003 — CSRF defense for cookie-authenticated writes (`POST /auth/refresh`,
 * `POST /auth/sign-out`). Those are the only endpoints that act on the browser's
 * `HttpOnly; SameSite=Lax; Path=/api/v1/auth` refresh cookie.
 *
 * Enforcement: when the request carries the refresh cookie and a cross-origin-capable header
 * (`Origin`, or `Referer`), that origin MUST be in `CORS_ALLOWED_ORIGINS`. A double-submit token
 * (`X-CSRF-Token`, already CORS-allowed) is also accepted when it matches the non-HttpOnly
 * `carrental_csrf` cookie. A request with neither a refresh cookie nor a cross-site origin (a
 * same-origin XHR, or a non-browser client using a bearer token) passes.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const hasRefreshCookie = Boolean(req.cookies?.[REFRESH_COOKIE]);
    if (!hasRefreshCookie) return true; // nothing cookie-authed to protect

    const origin = originOf(req);
    if (origin && !this.env.CORS_ALLOWED_ORIGINS.includes(origin)) {
      // double-submit fallback: header token must equal the readable csrf cookie
      const header = req.header('x-csrf-token');
      const cookie = req.cookies?.['carrental_csrf'] as string | undefined;
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
