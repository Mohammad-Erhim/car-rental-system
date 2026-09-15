import type { Readiness, BuildInfo } from '@carrental/contracts';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { DB } from '../database/database.module';
import type { Database } from '../database/drizzle';
import { lookupType, lookupValue } from '../database/schema/lookup';
import { outboxMessage } from '../database/schema/platform';

import { MetricsService } from './metrics';

type Status = 'ok' | 'degraded' | 'down';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private redis: Redis | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly metrics: MetricsService,
  ) {}

  // Deliberately its own connection rather than the app-wide SharedRedisService
  // (common/redis/redis.module.ts): the readiness probe needs `lazyConnect` + a bounded
  // `connectTimeout` + `enableOfflineQueue: false` so a down Redis fails this specific check
  // quickly instead of queuing/hanging — different semantics from the eager, always-connected
  // client the cache bus and rate limiter share.
  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(this.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => {});
    }
    return this.redis;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => {});
  }

  version(): BuildInfo {
    // In a real build, BUILD_TIME/GIT_SHA are injected. Locally, fall back to the process
    // start time so the value is meaningful rather than the Unix epoch.
    const builtAt =
      this.env.BUILD_TIME ?? new Date(Date.now() - process.uptime() * 1000).toISOString();
    return {
      name: 'carrental-api',
      version: this.env.GIT_SHA ? this.env.GIT_SHA.slice(0, 12) : '0.1.0-dev',
      gitSha: this.env.GIT_SHA ?? null,
      builtAt,
      nodeEnv: this.env.NODE_ENV,
      schemaVersion: null,
    };
  }

  async readiness(): Promise<Readiness> {
    const checks: Readiness['checks'] = {};

    checks.db = await this.timed(async () => {
      await this.db.execute(sql`select 1`);
    });

    checks.migrations = await this.timed(async () => {
      const rows = await this.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      const n = Number(rows[0]?.count ?? 0);
      if (n < 1) throw new Error('no migrations applied');
      return `${n} migrations applied`;
    });

    checks.redis = await this.timed(async () => {
      const r = this.getRedis();
      if (r.status !== 'ready') await r.connect().catch(() => {});
      const pong = await r.ping();
      if (pong !== 'PONG') throw new Error('unexpected ping response');
    });

    checks.lookups = await this.timed(async () => {
      // SRS-LKP-012: required closed code sets present and complete
      const types = await this.db.select().from(lookupType);
      const missing: string[] = [];
      for (const t of types) {
        if (!t.requiredCodes.length) continue;
        const values = await this.db
          .select({ code: lookupValue.code })
          .from(lookupValue)
          .where(sql`${lookupValue.typeCode} = ${t.code}`);
        const present = new Set(values.map((v) => v.code));
        for (const code of t.requiredCodes) {
          if (!present.has(code)) missing.push(`${t.code}:${code}`);
        }
      }
      if (missing.length)
        throw new Error(`missing lookup codes: ${missing.slice(0, 10).join(', ')}`);
      return `${types.length} lookup types verified`;
    });

    // SRS-OBS-006 — refresh the outbox-backlog gauge on every readiness probe (cheap, indexed).
    try {
      const rows = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(outboxMessage)
        .where(sql`${outboxMessage.deliveredAt} is null`);
      this.metrics.setOutboxBacklog(rows[0]?.n ?? 0);
    } catch {
      /* metric refresh is best-effort; never fail readiness on it */
    }

    const statuses = Object.values(checks).map((c) => c.status);
    const status: Status = statuses.includes('down')
      ? 'down'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'ok';

    return { status, checks };
  }

  private async timed(
    fn: () => Promise<string | void>,
  ): Promise<{ status: Status; detail?: string; durationMs: number }> {
    const start = performance.now();
    try {
      const detail = await fn();
      return {
        status: 'ok',
        detail: detail ?? undefined,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (err) {
      return {
        status: 'down',
        detail: err instanceof Error ? err.message : 'check failed',
        durationMs: Math.round(performance.now() - start),
      };
    }
  }
}
