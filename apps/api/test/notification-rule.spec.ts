import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-ADM-011 event-rules half — the *when / to whom / how* of a transactional message. A disabled
 * rule suppresses the send; the configured sender identity is stamped on the message. Timing +
 * escalation are stored and surfaced (scheduler enforcement is a follow-up). `config.publish`
 * gates writes.
 */
const EVENT = 'reservation_confirmed';

const isoIn = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
};

describe('notification event rules (FR-ADM-011)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let agent: string;
  let customer: string;
  let dayCursor = 40;

  const book = async () => {
    const day = (dayCursor += 3);
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(day),
        returnAt: isoIn(day + 2),
        categoryCode: 'economy',
        holderKey: `nr-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    return request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [
          {
            role: 'primary_renter',
            fullName: 'Nora Rule',
            email: 'nora@example.test',
            licenceNumber: 'D-NR-1',
          },
        ],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      })
      .expect(201);
  };

  const latestConfirmation = async () => {
    const mail = await request(server).get('/api/v1/dev/mail?limit=100').expect(200);
    return (mail.body.messages as Array<{ event: string }>).find((m) => m.event === EVENT) as
      | { event: string; deliveryState: string; lastError: string | null; sender: string | null }
      | undefined;
  };

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    agent = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    customer = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('lists a rule per templated event, defaulting to built-in values', async () => {
    const res = await request(server)
      .get('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const rule = (res.body as Array<{ event: string; isDefault: boolean; enabled: boolean }>).find(
      (r) => r.event === EVENT,
    );
    expect(rule).toBeTruthy();
    expect(rule!.isDefault).toBe(true);
    expect(rule!.enabled).toBe(true);
  });

  it('a rental agent (no config.publish) cannot edit a rule', async () => {
    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${agent}`)
      .send({ event: EVENT, enabled: false })
      .expect(403);
  });

  it('rejects malformed quiet hours', async () => {
    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .send({ event: EVENT, quietHours: { start: '99:99', end: '08:00' } })
      .expect(422);
  });

  it('a disabled rule suppresses the send; re-enabling + a sender identity is applied', async () => {
    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .send({ event: EVENT, channel: 'email', enabled: false })
      .expect(201)
      .expect((r) => {
        expect(r.body.enabled).toBe(false);
        expect(r.body.isDefault).toBe(false);
      });

    await book();
    const suppressed = await latestConfirmation();
    expect(suppressed?.deliveryState).toBe('suppressed');
    expect(suppressed?.lastError).toBe('rule_disabled');

    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .send({ event: EVENT, channel: 'email', enabled: true, senderIdentity: 'bookings' })
      .expect(201);

    await book();
    const sent = await latestConfirmation();
    expect(sent?.deliveryState).not.toBe('suppressed');
    expect(sent?.sender).toBe('bookings');
  });
});
