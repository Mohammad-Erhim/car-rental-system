import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit/audit.service';
import { CacheBus } from './cache/cache-bus';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { OutboxService } from './outbox/outbox.service';

/** Cross-cutting building blocks used by every domain module. */
@Global()
@Module({
  providers: [AuditService, OutboxService, IdempotencyService, IdempotencyInterceptor, CacheBus],
  exports: [AuditService, OutboxService, IdempotencyService, IdempotencyInterceptor, CacheBus],
})
export class CommonModule {}
