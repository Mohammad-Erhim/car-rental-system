import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ObjectStorageService } from '../src/common/object-storage/object-storage.service';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { customer, driver, driverDocument, privacyRequest } from '../src/database/schema/customer';
import { account, session } from '../src/database/schema/iam';
import { notification } from '../src/database/schema/notify';
import { paymentIntent } from '../src/database/schema/payment';
import { auditEvent, storedObject } from '../src/database/schema/platform';
import { reconciliationException, reservation } from '../src/database/schema/reservation';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * DEC-041 — data requests are fulfilled (FR-IAM-008). Until now a request was only ever RECORDED:
 * a closure was created "blocked" by a placeholder retention line, nothing moved a request past
 * `received`, there was no export, no erasure and no screen for staff. Here the whole loop runs:
 * the customer files; staff (`customer.manage`) work it from the queue; an access request releases
 * a download; a correction records what was fixed; a closure is blocked by what is really open and
 * otherwise closes the account and erases the personal data — keeping the transaction records the
 * business must retain.
 */
const PASSWORD = 'Sup3rSecret!!';
const STAFF_PASSWORD = 'Test-Passw0rd!';
const DAY = 86_400_000;
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('privacy requests: filed, worked, completed', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let admin: string;
  let manager: string;
  let agent: string; // rental_agent: customer.read, not customer.manage
  let configViewer: string; // no customer permissions at all
  let seq = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    const staff = (email: string) =>
      signIn(app, email, STAFF_PASSWORD, 'staff').then((s) => s.accessToken);
    admin = await staff('test-admin@example.test');
    manager = await staff('test-manager@example.test');
    agent = await staff('test-agent@example.test');
    configViewer = await staff('test-config-viewer@example.test');
  }, 120_000);
  afterAll(closeTestApp);

  async function newCustomer(label: string) {
    const email = `privacy-${label}-${Date.now()}-${seq++}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: `Privacy ${label}`, email, password: PASSWORD, acceptTerms: true })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    const s = await signIn(app, email, PASSWORD, 'customer');
    return { email, token: s.accessToken, accountId: s.actor.accountId };
  }

  async function book(token: string, dayOffset: number) {
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(dayOffset),
        returnAt: isoIn(dayOffset + 3),
        categoryCode: 'economy',
        holderKey: `privacy-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    const res = await request(server)
      .post('/api/v1/bookings/confirm')
      .set(auth(token))
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Priv Renter', email: 'priv@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);
    return res.body.reference as string;
  }

  const file = async (token: string, kind: string, detail?: string) =>
    (
      await request(server)
        .post('/api/v1/auth/data-requests')
        .set(auth(token))
        .send({ kind, detail })
        .expect(201)
    ).body;
  const mine = async (token: string) =>
    (await request(server).get('/api/v1/auth/data-requests').set(auth(token)).expect(200))
      .body as Array<Record<string, any>>;
  const stepUp = (token: string) =>
    request(server)
      .post('/api/v1/auth/step-up')
      .set(auth(token))
      .send({ password: STAFF_PASSWORD })
      .expect(201);
  /** completing can erase an account for good, so it asks for a fresh password */
  const complete = async (token: string, id: string, note?: string) => {
    await stepUp(token);
    return request(server)
      .post(`/api/v1/ops/privacy-requests/${id}/complete`)
      .set(auth(token))
      .send(note ? { note } : {});
  };
  const act = (token: string, id: string, action: 'review' | 'reject', body: object = {}) =>
    request(server)
      .post(`/api/v1/ops/privacy-requests/${id}/${action}`)
      .set(auth(token))
      .send(body);

  // ---------------------------------------------------------------- access

  it('ACCESS — filed, worked by staff, completed; the customer then downloads exactly their own data', async () => {
    const c = await newCustomer('access');
    const other = await newCustomer('bystander');
    const ref = await book(c.token, 130);
    const otherRef = await book(other.token, 130);

    const filed = await file(c.token, 'access', 'Please send me everything');
    expect(filed).toMatchObject({
      kind: 'access',
      status: 'received',
      blockers: [],
      exportReady: false,
    });
    expect(new Date(filed.dueAt).getTime() - new Date(filed.createdAt).getTime()).toBe(30 * DAY);
    // asking again while it is being worked on is the same request
    expect((await file(c.token, 'access')).id).toBe(filed.id);

    // nothing to download until staff have completed it
    await request(server)
      .get(`/api/v1/auth/data-requests/${filed.id}/export`)
      .set(auth(c.token))
      .expect(422);

    // staff see it — with the contact masked; a reader can look but not act
    const queue = await request(server)
      .get('/api/v1/ops/privacy-requests')
      .query({ status: 'open' })
      .set(auth(agent))
      .expect(200);
    const item = queue.body.items.find((i: { id: string }) => i.id === filed.id);
    expect(item).toMatchObject({ kind: 'access', status: 'received', overdue: false });
    expect(item.customer.name).toBe('Privacy access');
    expect(item.customer.email).toMatch(/^pr\*\*\*@example\.test$/);
    await request(server)
      .get(`/api/v1/ops/privacy-requests/${filed.id}`)
      .set(auth(agent))
      .expect(200);
    await act(agent, filed.id, 'review').expect(403);
    expect((await complete(agent, filed.id)).status).toBe(403);
    await request(server).get('/api/v1/ops/privacy-requests').set(auth(configViewer)).expect(403);

    // a manager takes it up
    const reviewing = await act(manager, filed.id, 'review').expect(201);
    expect(reviewing.body.status).toBe('in_review');
    expect((await mine(c.token))[0]!.status).toBe('in_review');

    // it is the customer's request only
    await request(server)
      .get(`/api/v1/auth/data-requests/${filed.id}/export`)
      .set(auth(other.token))
      .expect(404);
    await request(server)
      .post(`/api/v1/auth/data-requests/${filed.id}/cancel`)
      .set(auth(other.token))
      .expect(404);

    // completed with a note
    const done = await complete(admin, filed.id, 'Checked and released');
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({
      status: 'completed',
      resolutionNote: 'Checked and released',
    });
    const view = (await mine(c.token))[0]!;
    expect(view).toMatchObject({
      status: 'completed',
      resolutionNote: 'Checked and released',
      exportReady: true,
    });
    // the customer is told
    const notices = await db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.recipientRef, c.accountId),
          eq(notification.event, 'privacy_request_completed'),
        ),
      );
    expect(notices).toHaveLength(1);

    // the download: their data, as a file, and nobody else's
    const dl = await request(server)
      .get(`/api/v1/auth/data-requests/${filed.id}/export`)
      .set(auth(c.token))
      .expect(200);
    expect(dl.headers['content-disposition']).toMatch(
      /^attachment; filename="my-data-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(dl.headers['cache-control']).toBe('no-store');
    expect(dl.body.account).toMatchObject({ email: c.email, displayName: 'Privacy access' });
    expect(dl.body.profile).toMatchObject({ fullName: 'Privacy access' });
    const mineRes = dl.body.reservations.find((r: { reference: string }) => r.reference === ref);
    expect(mineRes).toBeTruthy();
    expect(mineRes.lines.length).toBeGreaterThan(0);
    expect(mineRes.drivers[0]).toMatchObject({ fullName: 'Priv Renter' });
    expect(dl.body.payments[0]).toMatchObject({ reservationReference: ref, cardLast4: '4242' });
    expect(dl.body.dataRequests[0]).toMatchObject({ kind: 'access', status: 'completed' });
    const text = JSON.stringify(dl.body);
    expect(text).not.toContain(otherRef);
    expect(text).not.toContain(other.email);
    for (const secret of [
      'passwordHash',
      'tokenHash',
      'accessTokenHash',
      'providerRef',
      'providerCustomerRef',
      'sim_cus_',
    ])
      expect(text, `export leaked ${secret}`).not.toContain(secret);
    // the download itself is on the audit trail
    const audits = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, 'iam.data_request.export_downloaded'));
    expect(audits.length).toBeGreaterThan(0);

    // finished is finished
    expect((await complete(admin, filed.id)).status).toBe(409);
    await act(admin, filed.id, 'reject', { note: 'too late' }).expect(409);
    await request(server)
      .post(`/api/v1/auth/data-requests/${filed.id}/cancel`)
      .set(auth(c.token))
      .expect(422);
  });

  it('ACCESS — two staff completing the same request at once: exactly one does', async () => {
    const c = await newCustomer('race');
    const filed = await file(c.token, 'access');
    await stepUp(admin);
    const [a, b] = await Promise.all([
      request(server)
        .post(`/api/v1/ops/privacy-requests/${filed.id}/complete`)
        .set(auth(admin))
        .send({}),
      request(server)
        .post(`/api/v1/ops/privacy-requests/${filed.id}/complete`)
        .set(auth(admin))
        .send({}),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await db
        .select()
        .from(notification)
        .where(
          and(
            eq(notification.recipientRef, c.accountId),
            eq(notification.event, 'privacy_request_completed'),
          ),
        ),
    ).toHaveLength(1);
  });

  it('NOTICE — the customer is told in their own language (template, not English fallback)', async () => {
    for (const [locale, expected] of [
      ['fr', 'Votre demande relative à vos données est terminée'],
      ['ar', 'اكتمل طلبك المتعلق ببياناتك'],
    ] as const) {
      const c = await newCustomer(`lang-${locale}`);
      await db.update(account).set({ localeCode: locale }).where(eq(account.id, c.accountId));
      const filed = await file(c.token, 'access');
      expect((await complete(admin, filed.id, 'ok')).status).toBe(201);
      const [msg] = await db
        .select()
        .from(notification)
        .where(
          and(
            eq(notification.recipientRef, c.accountId),
            eq(notification.event, 'privacy_request_completed'),
          ),
        );
      expect(msg).toMatchObject({
        localeCode: locale,
        templateKey: 'privacy_request_completed',
        subject: expected,
      });
      expect(msg!.body).toContain('ok'); // the staff member's note is in it
    }
  });

  // ---------------------------------------------------------------- correction / rejection

  it('CORRECTION — completed with a note of what was fixed (a note is required)', async () => {
    const c = await newCustomer('correction');
    const filed = await file(c.token, 'correction', 'My surname is misspelt on my booking');
    const noNote = await complete(admin, filed.id);
    expect(noNote.status).toBe(422);
    expect(noNote.body.code).toBe('validation_failed');
    expect((await mine(c.token))[0]!.status).toBe('received');
    const done = await complete(admin, filed.id, 'Corrected the surname on RES-…');
    expect(done.body).toMatchObject({
      status: 'completed',
      resolutionNote: 'Corrected the surname on RES-…',
    });
    expect((await mine(c.token))[0]).toMatchObject({ status: 'completed', exportReady: false });
  });

  it('REJECTION — needs a reason the customer can read; there is then nothing to download, and they can ask again', async () => {
    const c = await newCustomer('rejected');
    const filed = await file(c.token, 'access');
    await act(admin, filed.id, 'reject', { note: 'no' }).expect(422); // too short to be a reason
    const rejected = await act(admin, filed.id, 'reject', {
      note: 'We could not verify who you are',
    }).expect(201);
    expect(rejected.body).toMatchObject({
      status: 'rejected',
      resolutionNote: 'We could not verify who you are',
    });
    expect((await mine(c.token))[0]).toMatchObject({ status: 'rejected', exportReady: false });
    await request(server)
      .get(`/api/v1/auth/data-requests/${filed.id}/export`)
      .set(auth(c.token))
      .expect(422);
    expect((await file(c.token, 'access')).id).not.toBe(filed.id); // a new request, not the finished one
    expect(
      (
        await db
          .select()
          .from(notification)
          .where(
            and(
              eq(notification.recipientRef, c.accountId),
              eq(notification.event, 'privacy_request_rejected'),
            ),
          )
      ).length,
    ).toBe(1);
  });

  // ---------------------------------------------------------------- closure

  it('CLOSURE — open activity blocks it (and says what), staff cannot force it, and it unblocks itself when the activity ends', async () => {
    const c = await newCustomer('blocked');
    const ref = await book(c.token, 134);

    const filed = await file(c.token, 'closure');
    expect(filed.status).toBe('blocked');
    expect(filed.blockers).toEqual([
      expect.objectContaining({ code: 'open_reservations', count: 1 }),
    ]);
    expect(filed.blockers.map((b: { code: string }) => b.code)).not.toContain('retention_period');

    const refused = await complete(admin, filed.id);
    expect(refused.status).toBe(422);
    expect(refused.body.params).toMatchObject({
      reason: 'closure_blocked',
      blockers: 'open_reservations',
    });
    // nothing was touched
    expect((await db.select().from(account).where(eq(account.id, c.accountId)))[0]).toMatchObject({
      status: 'active',
      email: c.email,
    });
    await signIn(app, c.email, PASSWORD, 'customer');

    // the booking is cancelled — the request no longer has anything in its way
    await request(server)
      .post(`/api/v1/reservations/${ref}/cancel`)
      .set(auth(c.token))
      .send({})
      .expect(201);
    expect((await mine(c.token))[0]).toMatchObject({
      id: filed.id,
      status: 'received',
      blockers: [],
    });
  });

  it('CLOSURE — an unresolved payment issue on their booking also blocks it', async () => {
    const c = await newCustomer('payissue');
    const ref = await book(c.token, 138);
    await request(server)
      .post(`/api/v1/reservations/${ref}/cancel`)
      .set(auth(c.token))
      .send({})
      .expect(201);
    expect((await file(c.token, 'closure')).status).toBe('received');
    const [intent] = await db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.reservationReference, ref));
    await db.insert(reconciliationException).values({
      organizationId: intent!.organizationId,
      reservationReference: ref,
      kind: 'dispute',
    });
    const now = (await mine(c.token))[0]!;
    expect(now.status).toBe('blocked');
    expect(now.blockers).toEqual([
      expect.objectContaining({ code: 'open_payment_issues', count: 1 }),
    ]);
  });

  it('CLOSURE — completing it closes the login and erases the person, but KEEPS the transaction records', async () => {
    const c = await newCustomer('erase');
    const ref = await book(c.token, 142);
    await request(server)
      .post(`/api/v1/reservations/${ref}/cancel`)
      .set(auth(c.token))
      .send({})
      .expect(201);
    const [intentBefore] = await db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.reservationReference, ref));
    expect(intentBefore!.providerCustomerRef).toMatch(/^sim_cus_/); // a card was saved for reuse

    // a saved driver with a licence document on file
    const drv = await request(server)
      .post('/api/v1/auth/drivers')
      .set(auth(c.token))
      .send({
        role: 'additional',
        fullName: 'Dana Driver',
        dateOfBirth: '1990-01-01',
        email: 'dana@example.test',
        phone: '+15550000',
        licenceNumber: 'LIC-123',
        licenceCountry: 'US',
        licenceType: 'B',
        licenceExpiresOn: '2032-01-01',
      })
      .expect(201);
    const [cust] = await db.select().from(customer).where(eq(customer.accountId, c.accountId));
    const stored = await app.get(ObjectStorageService).put({
      purpose: 'driver_licence',
      ownerType: 'driver',
      ownerId: drv.body.id,
      data: Buffer.from('a photo of a licence'),
      mediaType: 'image/png',
    });
    const [obj] = await db
      .select()
      .from(storedObject)
      .where(eq(storedObject.objectKey, stored.key));
    await db.insert(driverDocument).values({
      driverId: drv.body.id,
      customerId: cust!.id,
      docType: 'licence',
      objectId: obj!.id,
    });
    expect(await app.get(ObjectStorageService).read(stored.key)).not.toBeNull();

    const filed = await file(c.token, 'closure');
    expect(filed.status).toBe('received');
    await act(manager, filed.id, 'review').expect(201);
    const done = await complete(admin, filed.id, 'Confirmed by phone');
    expect(done.status).toBe(201);
    expect(done.body.status).toBe('completed');
    expect(done.body.resolutionNote).toContain('Account closed');
    expect(done.body.resolutionNote).toContain('Kept for the legal retention period');
    expect(done.body.resolutionNote).toContain('Confirmed by phone');

    // the login is gone — the old token, and the old credentials
    await request(server).get('/api/v1/auth/me').set(auth(c.token)).expect(401);
    await request(server)
      .post('/api/v1/auth/sign-in')
      .send({ email: c.email, password: PASSWORD, audience: 'customer' })
      .expect(401);
    const [acc] = await db.select().from(account).where(eq(account.id, c.accountId));
    expect(acc).toMatchObject({
      status: 'closed',
      email: `closed-${c.accountId}@closed.invalid`,
      phone: null,
      passwordHash: null,
      displayName: 'Closed account',
    });
    const sessions = await db.select().from(session).where(eq(session.accountId, c.accountId));
    expect(sessions.length).toBeGreaterThan(0);
    expect(
      sessions.every((s) => s.revokedAt !== null && s.ip === null && s.userAgent === null),
    ).toBe(true);

    // the profile, drivers and documents are erased
    const [custAfter] = await db.select().from(customer).where(eq(customer.accountId, c.accountId));
    expect(custAfter).toMatchObject({
      fullName: 'Closed account',
      email: null,
      phone: null,
      status: 'closed',
    });
    const [drvAfter] = await db.select().from(driver).where(eq(driver.id, drv.body.id));
    expect(drvAfter).toMatchObject({
      fullName: 'Removed',
      dateOfBirth: null,
      email: null,
      phone: null,
      licenceNumber: null,
      licenceCountry: null,
    });
    expect(
      await db.select().from(driverDocument).where(eq(driverDocument.customerId, cust!.id)),
    ).toEqual([]);
    expect(
      await db.select().from(storedObject).where(eq(storedObject.objectKey, stored.key)),
    ).toEqual([]);
    expect(await app.get(ObjectStorageService).read(stored.key)).toBeNull();

    // messages we sent them keep that they went, not to whom or what they said — bar the one
    // confirming this closure, sent to the address the account had
    const messages = await db.select().from(notification);
    expect(messages.filter((m) => m.recipientRef === c.accountId)).toEqual([]);
    expect(
      messages.some((m) => m.recipient === c.email && m.event !== 'privacy_request_closed'),
    ).toBe(false);
    const confirmation = messages.filter((m) => m.recipient === c.email);
    expect(confirmation).toHaveLength(1);
    expect(confirmation[0]).toMatchObject({
      event: 'privacy_request_closed',
      templateKey: 'privacy_request_closed',
      localeCode: 'en',
    });
    expect(messages.some((m) => m.recipient === '[erased]' && m.body === '[erased]')).toBe(true);

    // the saved card is gone from our side too
    const [intentAfter] = await db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.reservationReference, ref));
    expect(intentAfter).toMatchObject({
      providerCustomerRef: null,
      providerMethodRef: null,
      methodLast4: '4242',
    });

    // KEPT: the reservation, the payment and the invoice records — and the audit trail
    const [kept] = await db.select().from(reservation).where(eq(reservation.reference, ref));
    expect(kept).toMatchObject({ accountId: c.accountId, state: 'cancelled' });
    expect(kept!.totalMinor).toBeGreaterThan(0);
    expect(
      (
        await db
          .select()
          .from(auditEvent)
          .where(eq(auditEvent.action, 'iam.data_request.closure.completed'))
      ).length,
    ).toBeGreaterThan(0);

    // staff still see the request, against a closed account; and it cannot be run twice
    const detail = await request(server)
      .get(`/api/v1/ops/privacy-requests/${filed.id}`)
      .set(auth(agent))
      .expect(200);
    expect(detail.body).toMatchObject({
      status: 'completed',
      customer: { name: 'Closed account' },
    });
    expect((await complete(admin, filed.id)).status).toBe(409);

    // and the address is free to be used again
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Same Person, New Account',
        email: c.email,
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
  });

  it('CLOSURE — if the payment provider cannot remove the saved cards, NOTHING changes and it can be retried', async () => {
    const c = await newCustomer('cards');
    const ref = await book(c.token, 146);
    await request(server)
      .post(`/api/v1/reservations/${ref}/cancel`)
      .set(auth(c.token))
      .send({})
      .expect(201);
    await db
      .update(paymentIntent)
      .set({ providerCustomerRef: 'sim_cus_forget_fail_1' })
      .where(eq(paymentIntent.reservationReference, ref));
    const filed = await file(c.token, 'closure');

    const failed = await complete(admin, filed.id);
    expect(failed.status).toBe(503);
    expect(failed.body.params.reason).toBe('saved_cards_not_removed');
    // the account is exactly as it was, and the request is still open
    expect((await db.select().from(account).where(eq(account.id, c.accountId)))[0]).toMatchObject({
      status: 'active',
      email: c.email,
    });
    await signIn(app, c.email, PASSWORD, 'customer');
    expect(
      (await db.select().from(privacyRequest).where(eq(privacyRequest.id, filed.id)))[0]!.status,
    ).toBe('received');
    expect(
      (await db.select().from(paymentIntent).where(eq(paymentIntent.reservationReference, ref)))[0]!
        .providerCustomerRef,
    ).toBe('sim_cus_forget_fail_1');

    // the provider recovers
    await db
      .update(paymentIntent)
      .set({ providerCustomerRef: 'sim_cus_ok_1' })
      .where(eq(paymentIntent.reservationReference, ref));
    expect((await complete(admin, filed.id)).status).toBe(201);
    expect((await db.select().from(account).where(eq(account.id, c.accountId)))[0]!.status).toBe(
      'closed',
    );
  });

  it('a customer can withdraw an open request, but not one that is finished', async () => {
    const c = await newCustomer('withdraw');
    const filed = await file(c.token, 'correction');
    const cancelled = await request(server)
      .post(`/api/v1/auth/data-requests/${filed.id}/cancel`)
      .set(auth(c.token))
      .expect(201);
    expect(cancelled.body.status).toBe('cancelled');
    await request(server)
      .post(`/api/v1/auth/data-requests/${filed.id}/cancel`)
      .set(auth(c.token))
      .expect(422);
    expect((await complete(admin, filed.id)).status).toBe(409); // staff cannot complete a withdrawn request
  });
});
