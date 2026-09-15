import { Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { SharedRedisService } from '../redis/redis.module';

/**
 * Lightweight Redis-backed cache + invalidation bus (SRS-LKP-011). Consuming surfaces cache
 * lookup/config responses by ETag; a mutation `publish()`es an invalidation so stale clients
 * revalidate before a consequential commit. Cache failure never changes authoritative behaviour.
 *
 * Uses the app-wide shared connection ({@link SharedRedisService}) rather than opening its own —
 * see that module's header for why.
 */
@Injectable()
export class CacheBus {
  private readonly logger = new Logger('CacheBus');
  private readonly handlers = new Map<string, Set<(payload: string) => void>>();

  constructor(private readonly shared: SharedRedisService) {}

  private get redis(): Redis {
    return this.shared.client;
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
}
