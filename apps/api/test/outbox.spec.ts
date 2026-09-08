import { sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  registerOutboxHandler,
  resetOutboxHandlers,
  runOutboxRelay,
} from '../src/common/outbox/outbox-relay';
import { createDb, type DbHandle } from '../src/database/drizzle';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * S7-DEF-002 — the transactional outbox must be relayed: emitted domain events get `delivered_at`
 * set, the table is pruned, failing rows back off then dead-letter, and the backlog is countable.
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const log = pino({ level: 'silent' });

describe('outbox relay (S7-DEF-002)', () => {
  let server: ReturnType<typeof httpServer>;
  let db: DbHandle['db'];
  let handle: DbHandle;
  let redis: IORedis;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    handle = createDb(process.env.DATABASE_URL_TEST!, { max: 1 });
    db = handle.db;
    redis = new IORedis(process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:6379/1', {
      maxRetriesPerRequest: null,
    });
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });

  afterAll(async () => {
    resetOutboxHandlers();
    await redis.quit().catch(() => {});
    await handle.close();
    await closeTestApp();
  });

  async function makeBooking() {
    const q = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(5),
        returnAt: isoIn(8),
        categoryCode: 'economy',
        holderKey: `ob-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: q.body.reference,
        drivers: [
          { role: 'primary_renter', fullName: 'Ob', licenceNumber: 'D-OB', licenceCountry: 'US' },
        ],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      })
      .expect(201);
  }

  const undelivered = async () =>
    Number(
      (
        (await db.execute(
          sql`select count(*)::int as n from outbox_message where delivered_at is null`,
        )) as unknown as { n: number }[]
      )[0]?.n ?? 0,
    );

  it('delivers committed domain events and drops the backlog to zero', async () => {
    await makeBooking();
    const before = await undelivered();
    expect(before).toBeGreaterThanOrEqual(3); // hold.placed + payment.captured + reservation.confirmed

    const r = await runOutboxRelay(db, redis, log, { retentionMs: 60_000 });
    expect(r.delivered).toBeGreaterThanOrEqual(before);
    expect(r.deadLettered).toBe(0);
    expect(await undelivered()).toBe(0);
    expect(r.backlog).toBe(0);
  });

  it('backs off then dead-letters a row whose handler keeps throwing, and calls onDeadLetter', async () => {
    registerOutboxHandler('s7.test.always_fails.v1', async () => {
      throw new Error('boom');
    });
    await db.execute(sql`
      insert into outbox_message (event_type, aggregate_type, aggregate_id, payload)
      values ('s7.test.always_fails.v1', 'test', 's7', '{}'::jsonb)
    `);

    const dead: string[] = [];
    // maxAttempts:1 → first failure is terminal
    const r = await runOutboxRelay(db, redis, log, {
      maxAttempts: 1,
      onDeadLetter: async (rec) => {
        dead.push(rec.eventType);
      },
    });
    expect(r.deadLettered).toBe(1);
    expect(dead).toEqual(['s7.test.always_fails.v1']);

    const row = (await db.execute(
      sql`select delivered_at, last_error from outbox_message where event_type = 's7.test.always_fails.v1'`,
    )) as unknown as { delivered_at: string | null; last_error: string | null }[];
    expect(row[0]?.delivered_at).not.toBeNull(); // stops counting as backlog
    expect(row[0]?.last_error).toContain('[dead-letter]');
  });

  it('retries (not dead-letters) while attempts remain, pushing available_at into the future', async () => {
    await db.execute(sql`
      insert into outbox_message (event_type, aggregate_type, aggregate_id, payload)
      values ('s7.test.always_fails.v1', 'test', 's7b', '{}'::jsonb)
    `);
    const r = await runOutboxRelay(db, redis, log, { maxAttempts: 5, backoffBaseMs: 1000 });
    expect(r.failed).toBe(1);
    expect(r.deadLettered).toBe(0);

    const row = (await db.execute(
      sql`select attempts, delivered_at, available_at > now() as future
            from outbox_message where event_type = 's7.test.always_fails.v1' and aggregate_id = 's7b'`,
    )) as unknown as { attempts: number; delivered_at: string | null; future: boolean }[];
    expect(row[0]?.attempts).toBe(1);
    expect(row[0]?.delivered_at).toBeNull();
    expect(row[0]?.future).toBe(true); // not retried until the backoff elapses

    // a second immediate pass claims nothing (still backing off)
    const r2 = await runOutboxRelay(db, redis, log, { maxAttempts: 5 });
    expect(r2.claimed).toBe(0);
  });

  it('prunes delivered rows older than the retention window', async () => {
    await db.execute(sql`
      insert into outbox_message (event_type, aggregate_type, aggregate_id, payload, delivered_at)
      values ('s7.test.old.v1', 'test', 's7old', '{}'::jsonb, now() - interval '30 days')
    `);
    const r = await runOutboxRelay(db, redis, log, { retentionMs: 7 * 24 * 60 * 60 * 1000 });
    expect(r.pruned).toBeGreaterThanOrEqual(1);
    const gone = (await db.execute(
      sql`select count(*)::int as n from outbox_message where event_type = 's7.test.old.v1'`,
    )) as unknown as { n: number }[];
    expect(Number(gone[0]?.n)).toBe(0);
  });
});
