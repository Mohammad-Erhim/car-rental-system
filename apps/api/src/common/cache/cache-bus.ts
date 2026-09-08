import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

/**
 * Lightweight Redis-backed cache + invalidation bus (SRS-LKP-011). Consuming surfaces cache
 * lookup/config responses by ETag; a mutation `publish()`es an invalidation so stale clients
 * revalidate before a consequential commit. Cache failure never changes authoritative behaviour.
 */
@Injectable()
export class CacheBus implements OnModuleDestroy {
  private readonly logger = new Logger('CacheBus');
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly handlers = new Map<string, Set<(payload: string) => void>>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  private get redis(): Redis {
    if (!this.client) {
      this.client = new Redis(this.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.client.on('error', (e) => this.logger.warn(`redis: ${e.message}`));
    }
    return this.client;
  }

  /** Bump the version counter for a cache namespace and broadcast an invalidation. */
  async invalidate(namespace: string, detail: Record<string, unknown> = {}): Promise<number> {
    try {
      const version = await this.redis.incr(`cachever:${namespace}`);
      await this.redis.publish(
        'cache:invalidate',
        JSON.stringify({ namespace, version, detail, at: new Date().toISOString() }),
      );
      return version;
    } catch (e) {
      this.logger.warn(`invalidate(${namespace}) failed: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Current version counter for a namespace — used to build ETags. */
  async version(namespace: string): Promise<number> {
    try {
      const v = await this.redis.get(`cachever:${namespace}`);
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => {});
    await this.subscriber?.quit().catch(() => {});
  }
}
