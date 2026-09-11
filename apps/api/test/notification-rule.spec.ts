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

  const book = async (token: string = customer) => {
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
      .set('Authorization', `Bearer ${token}`)
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

  type Message = {
    event: string;
    deliveryState: string;
    lastError: string | null;
    sender: string | null;
    subject: string | null;
    localeCode: string;
    templateKey: string | null;
  };

  const latestConfirmation = async () => {
    const mail = await request(server).get('/api/v1/dev/mail?limit=100').expect(200);
    return (mail.body.messages as Message[]).find((m) => m.event === EVENT);
  };

  /** Register + verify a fresh customer pinned to `localeCode`; returns their access token. */
  const customerWithLocale = async (localeCode: string) => {
    const email = `notify-locale-${localeCode}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Locale Customer',
        email,
        password: 'Sup3rSecret!!',
        localeCode,
        acceptTerms: true,
        marketingOptIn: false,
      })
      .expect(201);
    const verify = await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    return verify.body.accessToken as string;
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

  it('escalateAfterAttempts beyond maxAttempts is rejected — attempts stop first, it could never fire', async () => {
    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .send({ event: EVENT, channel: 'email', maxAttempts: 2, escalateAfterAttempts: 5 })
      .expect(422);

    // still rejected when maxAttempts is left at its saved value and only escalation moves past it
    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .send({ event: EVENT, channel: 'email', escalateAfterAttempts: 99 })
      .expect(422);
  });

  it('escalateAfterAttempts at or below maxAttempts is accepted', async () => {
    await request(server)
      .post('/api/v1/ops/notification-rules')
      .set('Authorization', `Bearer ${admin}`)
      .send({ event: EVENT, channel: 'email', maxAttempts: 5, escalateAfterAttempts: 3 })
      .expect(201)
      .expect((r) => {
        expect(r.body.maxAttempts).toBe(5);
        expect(r.body.escalateAfterAttempts).toBe(3);
      });
  });

  it('a locale with no published template of its own falls back through the runtime chain (DEC-024), not straight to raw JSON', async () => {
    // "fi" only exists in this run — a dashboard-added language whose fallback (set at creation,
    // not the static en/fr/ar list) reaches French before English.
    await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        code: 'fi',
        nativeName: 'Suomi',
        englishName: 'Finnish',
        direction: 'ltr',
        fallbackChain: ['fr'],
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/locales/fi/activate')
      .set('Authorization', `Bearer ${admin}`)
      .expect(201);

    const fiCustomer = await customerWithLocale('fi');
    await book(fiCustomer);

    const sent = await latestConfirmation();
    expect(sent?.localeCode).toBe('fi');
    // resolved via the fi -> fr -> en chain to the published French template, not the en default
    // and not the "[event] {...}" raw-JSON last resort.
    expect(sent?.templateKey).toBe(EVENT);
    expect(sent?.subject).toContain('réservation');
    expect(sent?.subject).not.toContain('booking');
  });
});
