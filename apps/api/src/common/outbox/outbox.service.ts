import { Inject, Injectable } from '@nestjs/common';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { outboxMessage } from '../../database/schema/platform';
import { getCorrelation } from '../correlation';

export interface DomainEvent {
  type: string; // e.g. 'lookup.value.changed.v1'
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  payload: Record<string, unknown>;
}

/**
 * Transactional outbox (SRS-FLOW-002). `emit()` must be called inside the same transaction as
 * the aggregate write — pass the transaction handle as `tx`. A worker relays committed rows to
 * Redis / read models / notifications.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async emit(event: DomainEvent, tx?: Database): Promise<void> {
    const db = tx ?? this.db;
    await db.insert(outboxMessage).values({
      eventType: event.type,
      eventVersion: 1,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion ?? 1,
      payload: event.payload,
      traceId: getCorrelation()?.traceId ?? null,
    });
  }
}
