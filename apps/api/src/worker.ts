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

import { createDb } from './database/drizzle';
import { authChallenge } from './database/schema/iam';
import { idempotencyKey, outboxMessage } from './database/schema/platform';
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

  const worker = new Worker(
    'housekeeping',
    async (job: Job) => {
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
        const backlog = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(outboxMessage)
          .where(sql`${outboxMessage.deliveredAt} is null`);
        log.info(
          {
            reapedChallenges: challenges.length,
            reapedIdempotencyKeys: keys.length,
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
