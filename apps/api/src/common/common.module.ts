import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit/audit.service';
import { CacheBus } from './cache/cache-bus';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { ObjectStorageService } from './object-storage/object-storage.service';
import { OutboxService } from './outbox/outbox.service';
import { RedisModule } from './redis/redis.module';

/** Cross-cutting building blocks used by every domain module. */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    AuditService,
    OutboxService,
    IdempotencyService,
    IdempotencyInterceptor,
    CacheBus,
    ObjectStorageService,
  ],
  exports: [
    AuditService,
    OutboxService,
    IdempotencyService,
    IdempotencyInterceptor,
    CacheBus,
    ObjectStorageService,
  ],
})
export class CommonModule {}
