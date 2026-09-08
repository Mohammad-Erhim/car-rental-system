/**
 * Outbox relay (SRS-FLOW-002, IF-EVT-OUTBOX, SRS §"workers periodically inspect … outbox messages
 * not delivered"). `OutboxService.emit()` writes `outbox_message` rows inside the aggregate
 * transaction; this drains them: claim undelivered rows (`FOR UPDATE SKIP LOCKED`, `seq` order),
 * dispatch each to the registered handlers for its event type, mark it delivered, back off +
 * dead-letter on repeated failure, and prune old delivered rows so the table stays bounded.
 *
 * Every domain side effect today already runs **synchronously in-process** at the point of
 * `emit()` (notification send, `CacheBus.invalidate`, recovery-case open). The relay therefore
 * makes the outbox a *durable, at-least-once* backstop and the truthful source for the
 * `outbox_backlog` metric — it does not replace those in-process effects. External / read-model /
 * multi-instance fan-out plugs in via `registerOutboxHandler()` (deferred — no such consumer is
 * in scope: APP-CMOB is deferred and there are no live third-party integrations). See S7-DEF-002.
 */
import { and, isNull, lt, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { Database } from '../../database/drizzle';
import { outboxMessage } from '../../database/schema/platform';

export interface OutboxRecord {
  id: string;
  seq: number;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  traceId: string | null;
}

export type OutboxHandler = (
  record: OutboxRecord,
  ctx: { redis: Redis; log: Logger },
) => Promise<void>;

const handlers = new Map<string, OutboxHandler[]>();

/** Register a handler for an exact event type (e.g. `reservation.confirmed.v1`). */
export function registerOutboxHandler(eventType: string, handler: OutboxHandler): void {
  const list = handlers.get(eventType) ?? [];
  list.push(handler);
  handlers.set(eventType, list);
}

/** Test/bootstrapping aid — drop all registered handlers. */
export function resetOutboxHandlers(): void {
  handlers.clear();
}

/**
 * Durable backstop for the cache-invalidation events. The in-process `CacheBus.invalidate()`
 * already bumped the version counter at `emit()` time (and swallows its own errors); replaying
 * it here is idempotent — a client that already revalidated simply sees an unchanged version —
 * and guarantees the bump survived even if that in-process call failed or a second instance
 * needs to hear it. Mirrors `CacheBus.invalidate`: `INCR cachever:<ns>` + `PUBLISH cache:invalidate`.
 */
const cacheInvalidationHandler: OutboxHandler = async (rec, { redis }) => {
  const ns =
    rec.eventType === 'lookup.invalidated.v1'
      ? `lookup:${String(rec.payload.typeCode ?? rec.aggregateId)}`
      : rec.eventType === 'config.translation.published'
        ? 'translations'
        : 'catalogue';
  const version = await redis.incr(`cachever:${ns}`);
  await redis.publish(
    'cache:invalidate',
    JSON.stringify({
      namespace: ns,
      version,
      detail: { via: 'outbox', eventType: rec.eventType },
      at: new Date().toISOString(),
    }),
  );
};
for (const t of ['lookup.invalidated.v1', 'catalogue.changed.v1', 'config.translation.published']) {
  registerOutboxHandler(t, cacheInvalidationHandler);
}

export interface OutboxRelayOptions {
  batchSize?: number;
  maxAttempts?: number;
  /** delivered rows older than this are pruned */
  retentionMs?: number;
  /** back-off before a failed row is retried: base * 2^(attempts-1), capped */
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** called for a row that exhausted `maxAttempts` (e.g. push to a dead-letter queue) */
  onDeadLetter?: (rec: OutboxRecord, lastError: string) => Promise<void>;
}

export interface OutboxRelayResult {
  claimed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  pruned: number;
  backlog: number;
}

const DEFAULTS = {
  batchSize: 100,
  maxAttempts: 8,
  retentionMs: 7 * 24 * 60 * 60 * 1000,
  backoffBaseMs: 2_000,
  backoffCapMs: 5 * 60 * 1000,
};

/** One relay pass. Safe to run concurrently (rows are claimed with `SKIP LOCKED`). */
export async function runOutboxRelay(
  db: Database,
  redis: Redis,
  log: Logger,
  options: OutboxRelayOptions = {},
): Promise<OutboxRelayResult> {
  const opt = { ...DEFAULTS, ...options };
  const res: OutboxRelayResult = {
    claimed: 0,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    pruned: 0,
    backlog: 0,
  };

  await db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      select id, seq, event_type as "eventType", event_version as "eventVersion",
             aggregate_type as "aggregateType", aggregate_id as "aggregateId",
             aggregate_version as "aggregateVersion", payload, attempts, trace_id as "traceId"
        from outbox_message
       where delivered_at is null and available_at <= now()
       order by seq
       limit ${opt.batchSize}
       for update skip locked
    `)) as unknown as OutboxRecord[];
    res.claimed = rows.length;

    for (const rec of rows) {
      const list = handlers.get(rec.eventType) ?? [];
      try {
        for (const h of list) await h(rec, { redis, log });
        await tx
          .update(outboxMessage)
          .set({ deliveredAt: sql`now()`, attempts: rec.attempts + 1, lastError: null })
          .where(sql`${outboxMessage.id} = ${rec.id}`);
        res.delivered++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const attempts = rec.attempts + 1;
        if (attempts >= opt.maxAttempts) {
          if (opt.onDeadLetter) await opt.onDeadLetter(rec, msg).catch(() => {});
          // stop counting it as backlog, keep it auditable
          await tx
            .update(outboxMessage)
            .set({
              deliveredAt: sql`now()`,
              attempts,
              lastError: `[dead-letter] ${msg}`.slice(0, 2000),
            })
            .where(sql`${outboxMessage.id} = ${rec.id}`);
          res.deadLettered++;
          log.error(
            { outboxId: rec.id, eventType: rec.eventType, attempts, err: msg },
            'outbox row dead-lettered',
          );
        } else {
          const delay = Math.min(opt.backoffCapMs, opt.backoffBaseMs * 2 ** (attempts - 1));
          await tx
            .update(outboxMessage)
            .set({
              attempts,
              lastError: msg.slice(0, 2000),
              availableAt: sql`now() + (${delay} || ' milliseconds')::interval`,
            })
            .where(sql`${outboxMessage.id} = ${rec.id}`);
          res.failed++;
        }
      }
    }
  });

  // retention prune (outside the claim tx)
  const pruned = (await db
    .delete(outboxMessage)
    .where(
      and(
        sql`${outboxMessage.deliveredAt} is not null`,
        lt(
          outboxMessage.deliveredAt,
          sql`now() - (${opt.retentionMs} || ' milliseconds')::interval`,
        ),
      ),
    )
    .returning({ id: outboxMessage.id })) as { id: string }[];
  res.pruned = pruned.length;

  const backlogRows = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outboxMessage)
    .where(isNull(outboxMessage.deliveredAt))) as { n: number }[];
  res.backlog = backlogRows[0]?.n ?? 0;

  return res;
}
