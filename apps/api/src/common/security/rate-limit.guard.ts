import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Redis } from 'ioredis';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { AppError, ERROR_CODE } from '../app-error';

import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';

/**
 * SRS-SEC-015 — fixed-window rate limiter for abuse-prone routes (auth, recovery). Keyed by
 * bucket + client IP. Redis-backed so it holds across workers; **fails open** on a Redis error
 * (availability over strict limiting for this deployment). Registered as an APP_GUARD ahead of
 * AuthGuard so unauthenticated floods are capped too.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimitGuard');
  private client: Redis | null = null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get redis(): Redis {
    if (!this.client) {
      this.client = new Redis(this.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
      this.client.on('error', (e) => this.logger.warn(`redis: ${e.message}`));
    }
    return this.client;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.env.RATE_LIMIT_ENABLED) return true;

    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;

    const limit =
      opts.preset === 'auth'
        ? this.env.RATE_LIMIT_AUTH_MAX
        : opts.preset === 'discovery-quote'
          ? this.env.RATE_LIMIT_DISCOVERY_QUOTE_MAX
          : (opts.limit ?? Number.MAX_SAFE_INTEGER);
    const windowSec =
      opts.preset === 'auth'
        ? this.env.RATE_LIMIT_AUTH_WINDOW_SEC
        : opts.preset === 'discovery-quote'
          ? this.env.RATE_LIMIT_DISCOVERY_QUOTE_WINDOW_SEC
          : (opts.windowSec ?? 60);

    const req = context.switchToHttp().getRequest<Request>();
    const ip = clientIp(req);
    const bucket = opts.bucket ?? `${req.method}:${req.baseUrl}${req.path}`;
    const windowId = Math.floor(Date.now() / 1000 / windowSec);
    const key = `ratelimit:${bucket}:${ip}:${windowId}`;

    let count: number;
    try {
      count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSec + 1);
    } catch (e) {
      this.logger.warn(`rate check failed open (${bucket}): ${(e as Error).message}`);
      return true;
    }

    if (count > limit) {
      const res = context
        .switchToHttp()
        .getResponse<{ setHeader: (k: string, v: string) => void }>();
      res.setHeader('Retry-After', String(windowSec));
      throw new AppError(ERROR_CODE.RATE_LIMITED, {
        title: 'Too many requests — try again shortly',
        params: { retryAfterSeconds: windowSec },
      });
    }
    return true;
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
