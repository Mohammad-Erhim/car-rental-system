import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'security:rateLimit';

export interface RateLimitOptions {
  /** requests allowed per window, per client key; omit when using `preset` */
  limit?: number;
  /** window length in seconds; omit when using `preset` */
  windowSec?: number;
  /** resolve limit/window from env instead of literals */
  preset?: 'auth' | 'discovery-quote' | 'booking-confirm';
  /** optional bucket name; defaults to the route path */
  bucket?: string;
}

/**
 * SRS-SEC-015 — apply an abuse/rate control to a route. Enforced by {@link RateLimitGuard}
 * (fixed window, Redis-backed, keyed by bucket + client IP). Fails open if Redis is unavailable;
 * the whole guard is a no-op when `RATE_LIMIT_ENABLED=false`.
 */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);
