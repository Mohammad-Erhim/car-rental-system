/**
 * Worker process (SRS-CMP-WORKER, SRS-ARC-006). Separately runnable; idempotent handlers;
 * bounded retries; poison work → dead-letter. STAGE-000 registers one housekeeping job that
 * reaps expired auth challenges / idempotency keys and logs outbox backlog.
 */
import 'reflect-metadata';

import { Queue, Worker, type Job } from 'bullmq';
import { lt, sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import pino from 'pino';

import { runOutboxRelay } from './common/outbox/outbox-relay';
import { createDb } from './database/drizzle';
import { authChallenge } from './database/schema/iam';
import { idempotencyKey, outboxMessage } from './database/schema/platform';
import { rental } from './database/schema/rental';
import { bootstrapEnvForScript } from './database/script-env';

const log = pino({ name: 'carrental-worker', level: process.env.LOG_LEVEL ?? 'info' });

async function main() {
  const env = bootstrapEnvForScript();
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const { db, close } = createDb(env.DATABASE_URL);

  const housekeeping = new Queue('housekeeping', { connection });
  const deadLetter = new Queue('housekeeping-dlq', { connection });

  // schedule housekeeping every 5 minutes (repeatable job)
  await housekeeping.add(
    'reap',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'housekeeping-tick',
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );

  // Outbox relay every 15s (SRS-FLOW-002 — deliver committed domain events + prune, so
  // `outbox_message` stays bounded and `outbox_backlog` is truthful). See `outbox-relay.ts`.
  await housekeeping.add(
    'outbox-relay',
    {},
    {
      repeat: { every: 15 * 1000 },
      jobId: 'outbox-relay-tick',
      removeOnComplete: 20,
      removeOnFail: 20,
    },
  );

  const worker = new Worker(
    'housekeeping',
    async (job: Job) => {
      if (job.name === 'outbox-relay') {
        const r = await runOutboxRelay(db, connection, log, {
          onDeadLetter: async (rec, lastError) => {
            await deadLetter.add('outbox-poison', {
              outboxId: rec.id,
              eventType: rec.eventType,
              aggregate: `${rec.aggregateType}:${rec.aggregateId}`,
              lastError,
            });
          },
        });
        if (r.delivered || r.failed || r.deadLettered || r.pruned) {
          log.info(r, 'outbox relay tick');
        }
        return r;
      }
      if (job.name === 'reap') {
        const nowExpr = sql`now()`;
        const challenges = await db
          .delete(authChallenge)
          .where(lt(authChallenge.expiresAt, sql`now()`))
          .returning({ id: authChallenge.id });
        const keys = await db
          .delete(idempotencyKey)
          .where(lt(idempotencyKey.expiresAt, sql`now()`))
          .returning({ id: idempotencyKey.id });
        // FR-RNT-014 — an active rental past its scheduled return flips to `overdue`. The unit
        // stays `on_rent`, so it is already excluded from availability; this just makes the
        // state (and the ops board) truthful. Idempotent: only `active` rows match.
        const overdue = await db
          .update(rental)
          .set({ state: 'overdue', updatedAt: sql`now()` })
          .where(sql`${rental.state} = 'active' and ${rental.scheduledReturnAt} < now()`)
          .returning({ id: rental.id });
        const backlog = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(outboxMessage)
          .where(sql`${outboxMessage.deliveredAt} is null`);
        log.info(
          {
            reapedChallenges: challenges.length,
            reapedIdempotencyKeys: keys.length,
            markedOverdue: overdue.length,
            outboxBacklog: backlog[0]?.n ?? 0,
            _nowExpr: String(nowExpr),
          },
          'housekeeping tick',
        );
        return { ok: true };
      }
      return { skipped: job.name };
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', async (job, err) => {
    log.error({ jobId: job?.id, name: job?.name, err: err.message }, 'job failed');
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await deadLetter.add('poison', { original: job.name, data: job.data, error: err.message });
      log.warn({ jobId: job.id }, 'moved to dead-letter queue');
    }
  });

  log.info('worker started (queue: housekeeping)');

  const shutdown = async () => {
    log.info('worker shutting down');
    await worker.close();
    await housekeeping.close();
    await deadLetter.close();
    await connection.quit();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error({ err }, 'worker failed to start');
  process.exit(1);
});
