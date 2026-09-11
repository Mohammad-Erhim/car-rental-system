/**
 * Worker process (SRS-CMP-WORKER, SRS-ARC-006). Separately runnable; idempotent handlers;
 * bounded retries; poison work → dead-letter. STAGE-000 registers housekeeping jobs that reap
 * expired auth challenges / idempotency keys, log outbox backlog, and (FR-RPT-006) dispatch due
 * report schedules — the only job that needs real domain logic (report generation + the notify
 * pipeline), so it runs through a headless Nest application context (`createApplicationContext`,
 * no HTTP listener) instead of duplicating that logic in raw SQL like the others.
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Queue, Worker, type Job } from 'bullmq';
import { lt, sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import pino from 'pino';

import { AppModule } from './app.module';
import { runOutboxRelay } from './common/outbox/outbox-relay';
import { createDb } from './database/drizzle';
import { authChallenge } from './database/schema/iam';
import { idempotencyKey, outboxMessage } from './database/schema/platform';
import { rental } from './database/schema/rental';
import { bootstrapEnvForScript } from './database/script-env';
import { ReportService } from './modules/report/report.service';

const log = pino({ name: 'carrental-worker', level: process.env.LOG_LEVEL ?? 'info' });

async function main() {
  const env = bootstrapEnvForScript();
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const { db, close } = createDb(env.DATABASE_URL);
  const appCtx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportService = appCtx.get(ReportService);

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

  // FR-RPT-006 — once a minute, dispatch every active report schedule whose next cron occurrence
  // has arrived. A minute matches the coarsest cron field's own granularity; ticking any faster
  // buys nothing since cron can't ask for finer than a minute anyway.
  await housekeeping.add(
    'report-dispatch',
    {},
    {
      repeat: { every: 60 * 1000 },
      jobId: 'report-dispatch-tick',
      removeOnComplete: 50,
      removeOnFail: 50,
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
      if (job.name === 'report-dispatch') {
        const r = await reportService.dispatchDueSchedules(new Date());
        if (r.dispatched.length) log.info(r, 'report schedule dispatch tick');
        if (r.failed.length)
          log.error(
            { failed: r.failed },
            'report schedule dispatch: some due schedules failed — will retry next tick',
          );
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
    await appCtx.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error({ err }, 'worker failed to start');
  process.exit(1);
});
