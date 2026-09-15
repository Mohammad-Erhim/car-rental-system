import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

/**
 * Single shared ioredis connection for the hot-path, DI-managed consumers that each used to open
 * their own ad-hoc client (`CacheBus`, `RateLimitGuard`) — on this memory-constrained host, two
 * separate TCP connections/client buffers for what is functionally one Redis server was wasteful,
 * and only `CacheBus` cleaned up on shutdown.
 *
 * `HealthService`'s readiness probe deliberately keeps its own client: it needs `lazyConnect` +
 * a bounded `connectTimeout` + `enableOfflineQueue: false` so a down Redis fails the readiness
 * check quickly rather than queuing/hanging — genuinely different semantics from the eager,
 * always-connected client the cache bus and rate limiter want. It still gets its own
 * `OnModuleDestroy` cleanup, just not this shared connection.
 *
 * The worker process's BullMQ connection (`worker.ts`) is a separate process entirely, not part
 * of this Nest app's DI graph, and BullMQ *requires* `maxRetriesPerRequest: null` for its
 * blocking commands — incompatible with this client's settings, so it isn't a candidate for
 * consolidation here. It already cleans up its own connection on SIGINT/SIGTERM.
 */
@Injectable()
export class SharedRedisService implements OnModuleDestroy {
  private readonly logger = new Logger('SharedRedis');
  readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
    this.client.on('error', (e) => this.logger.warn(`redis: ${e.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => {});
  }
}

@Global()
@Module({
  providers: [SharedRedisService],
  exports: [SharedRedisService],
})
export class RedisModule {}
