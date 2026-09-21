import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PasswordService } from '../src/common/auth/password.service';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { account, staffProfile } from '../src/database/schema/iam';
import { organization } from '../src/database/schema/org';
import { paymentIntent } from '../src/database/schema/payment';
import { setStaffRoles } from '../src/database/seed/staff-roles';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * DEC-038 — the routes customers use to see and change THEIR reservation / rental are also reached
 * by staff (the dashboard calls them). `assertOwnerOrStaff` only asked "is this staff?", so a role
 * holding no reservation or payment permission at all could read, cancel and fully refund any
 * booking (an audit found a `config.read`-only account doing exactly that). `@StaffPermissions` now
 * asks staff for the same permissions the matching `/ops` route and the dashboard button require;
 * customers are untouched and still pass through to the ownership check.
 */
const PASSWORD = 'Test-Passw0rd!';
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('staff permission gate on the customer-facing reservation / rental routes', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  const tok: Record<string, string> = {};
  let customerToken: string;
  let strangerToken: string;

  const asStaff = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

  async function makeStaff(email: string, roles: string[]) {
    const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
    const passwordHash = await app.get(PasswordService).hash(PASSWORD);
    const [acc] = await db
      .insert(account)
      .values({
        kind: 'staff',
        email,
        emailNormalized: email,
        emailVerifiedAt: new Date().toISOString(),
        passwordHash,
        status: 'active',
        displayName: email,
        localeCode: 'en',
      })
      .returning();
    const [profile] = await db
      .insert(staffProfile)
      .values({
        accountId: acc!.id,
        organizationId: org!.id,
        locationScope: [],
        status: 'active',
        activatedAt: new Date().toISOString(),
      })
      .returning();
    await setStaffRoles(db, profile!.id, org!.id, roles);
  }

  async function book(dayOffset: number, category = 'economy', token = customerToken) {
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(dayOffset),
        returnAt: isoIn(dayOffset + 3),
        categoryCode: category,
        holderKey: `gate-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    const res = await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Gate Tester', email: 'gate@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);
    return res.body as { reference: string; paidMinor: number };
  }

  const intentOf = async (reference: string) =>
    (
      await db
        .select()
        .from(paymentIntent)
        .where(
          and(
            eq(paymentIntent.reservationReference, reference),
            eq(paymentIntent.purpose, 'booking'),
          ),
        )
    )[0]!;

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);

    // the two seeded system roles no fixture account holds: modify-only support, read-only auditor
    await makeStaff('gate-support@example.test', ['support_staff']);
    await makeStaff('gate-auditor@example.test', ['auditor']);

    const staff: Array<[string, string]> = [
      ['admin', 'test-admin@example.test'], //          * (wildcard)
      ['manager', 'test-manager@example.test'], //      ALL
      ['agent', 'test-agent@example.test'], //          rental_agent: reservation.* + rental.*
      ['finance', 'test-finance@example.test'], //      reservation.read, payment.*, rental.read — no cancel/modify
      ['fleet', 'test-fleet-scoped@example.test'], //   fleet + rental.read — no reservation.*
      ['config', 'test-config-viewer@example.test'], // config.read ONLY
      ['lookup', 'test-lookup-manager@example.test'], // lookup.manage ONLY
      ['support', 'gate-support@example.test'], //      reservation.read + modify (no cancel)
      ['auditor', 'gate-auditor@example.test'], //      read-only
    ];
    for (const [k, email] of staff)
      tok[k] = (await signIn(app, email, PASSWORD, 'staff')).accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', PASSWORD, 'customer'))
      .accessToken;

    const email = `gate-stranger-${Date.now()}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Gate Stranger', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    strangerToken = (await signIn(app, email, 'Sup3rSecret!!', 'customer')).accessToken;
  }, 120_000);
  afterAll(closeTestApp);

  it('READ — roles with no reservation/payment permission are refused; every role that has one still reads', async () => {
    const r = await book(60);
    const readPaths = [
      `/api/v1/reservations/${r.reference}`,
      `/api/v1/reservations/${r.reference}/history`,
      `/api/v1/bookings/${r.reference}`,
    ];

    for (const who of ['config', 'lookup', 'fleet']) {
      for (const path of readPaths) {
        const res = await request(server).get(path).set(asStaff(who));
        expect(res.status, `${who} GET ${path}`).toBe(403);
      }
    }
    // the guard answers before the record is even looked up — no 404 that would reveal whether it exists
    await request(server)
      .get('/api/v1/reservations/RES-DOES-NOT-EXIST')
      .set(asStaff('config'))
      .expect(403);

    for (const who of ['admin', 'manager', 'agent', 'finance', 'support', 'auditor']) {
      for (const path of readPaths) {
        const res = await request(server).get(path).set(asStaff(who));
        expect(res.status, `${who} GET ${path}`).toBe(200);
        expect(res.body.reference ?? r.reference).toBe(r.reference);
      }
    }

    // customers are untouched: the owner reads, a stranger is refused by the ownership check
    await request(server)
      .get(readPaths[0]!)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    await request(server)
      .get(readPaths[0]!)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);
  });

  it('INVOICES — allowed for reservation.read | payment.read | payment.reconcile, refused otherwise', async () => {
    const r = await book(63);
    const path = `/api/v1/reservations/${r.reference}/invoices`;
    for (const who of ['config', 'lookup', 'fleet']) {
      await request(server).get(path).set(asStaff(who)).expect(403);
      await request(server).get(`${path}/INV-0001`).set(asStaff(who)).expect(403);
    }
    for (const who of ['admin', 'agent', 'finance', 'support', 'auditor']) {
      await request(server).get(path).set(asStaff(who)).expect(200);
    }
    await request(server).get(path).set('Authorization', `Bearer ${customerToken}`).expect(200);
  });

  it('CANCEL — the exploit is closed: a config.read-only role cannot cancel or refund; nothing changes', async () => {
    const r = await book(66);
    const before = await intentOf(r.reference);
    expect(before.state).toBe('captured');
    expect(before.refundedMinor).toBe(0);

    // config-viewer is the exact account the audit used; finance/auditor/fleet/lookup hold no cancel or modify
    for (const who of ['config', 'lookup', 'fleet', 'finance', 'auditor']) {
      const res = await request(server)
        .post(`/api/v1/reservations/${r.reference}/cancel`)
        .set(asStaff(who))
        .send({});
      expect(res.status, `${who} cancel`).toBe(403);
    }

    // …and the forbidden attempts really did nothing: still confirmed, nothing refunded
    const still = await request(server)
      .get(`/api/v1/reservations/${r.reference}`)
      .set(asStaff('admin'))
      .expect(200);
    expect(still.body.state).toBe('confirmed');
    const after = await intentOf(r.reference);
    expect(after.state).toBe('captured');
    expect(after.refundedMinor).toBe(0);

    // a rental agent (reservation.cancel) cancels it — the normal path is intact, refund included
    const cancelled = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set(asStaff('agent'))
      .send({})
      .expect(201);
    expect(cancelled.body.state).toBe('cancelled');
    expect(cancelled.body.refundMinor).toBeGreaterThan(0);
    expect((await intentOf(r.reference)).refundedMinor).toBe(cancelled.body.refundMinor);
  });

  it('CANCEL — reservation.modify alone is enough, exactly as the dashboard Cancel button and /ops no-show treat it', async () => {
    // documents the intended semantics so tightening it later is a deliberate, visible change
    const r = await book(69);
    const res = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set(asStaff('support'))
      .send({})
      .expect(201);
    expect(res.body.state).toBe('cancelled');
  });

  it('CANCEL — a customer still cancels their own booking; a stranger still cannot', async () => {
    const r = await book(72);
    await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({})
      .expect(403);
    const own = await request(server)
      .post(`/api/v1/reservations/${r.reference}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);
    expect(own.body.state).toBe('cancelled');
  });

  it('MODIFY — needs reservation.modify; the guard answers before validation, allowed roles reach it', async () => {
    const r = await book(75);
    const body = { returnAt: 'not-a-date' }; // invalid on purpose: 422 proves the guard let the caller through
    for (const who of ['config', 'lookup', 'fleet', 'finance', 'auditor']) {
      const res = await request(server)
        .post(`/api/v1/reservations/${r.reference}/modify`)
        .set(asStaff(who))
        .send(body);
      expect(res.status, `${who} modify`).toBe(403);
    }
    for (const who of ['admin', 'manager', 'agent', 'support']) {
      const res = await request(server)
        .post(`/api/v1/reservations/${r.reference}/modify`)
        .set(asStaff(who))
        .send(body);
      expect(res.status, `${who} modify`).toBe(422);
    }
    const untouched = await request(server)
      .get(`/api/v1/reservations/${r.reference}`)
      .set(asStaff('admin'))
      .expect(200);
    expect(new Date(untouched.body.returnAt).toISOString()).toBe(isoIn(78));
  });

  it('GUEST — a guest with the link token still reads their booking; a staff caller must hold a permission', async () => {
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(80),
        returnAt: isoIn(83),
        categoryCode: 'economy',
        holderKey: `gate-guest-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    const guest = await request(server)
      .post('/api/v1/bookings/confirm')
      .send({
        quoteReference: quote.body.reference,
        drivers: [
          { role: 'primary_renter', fullName: 'Guest Gate', email: 'guest-gate@example.test' },
        ],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);
    const { reference, guestAccessToken } = guest.body as {
      reference: string;
      guestAccessToken: string;
    };
    expect(guestAccessToken).toBeTruthy();

    await request(server)
      .get(`/api/v1/bookings/${reference}`)
      .query({ token: guestAccessToken })
      .expect(200);
    await request(server).get(`/api/v1/bookings/${reference}`).expect(401); // no token, no session
    await request(server)
      .get(`/api/v1/bookings/${reference}`)
      .query({ token: guestAccessToken })
      .set(asStaff('config'))
      .expect(403); // being staff without a reservation permission is not a way in, token or not
    await request(server).get(`/api/v1/bookings/${reference}`).set(asStaff('agent')).expect(200);
  });

  it('RENTAL — detail needs a rental permission; extend needs rental.pickup | rental.return', async () => {
    const r = await book(90, 'compact');
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${r.reference}/assign`)
      .set(asStaff('agent'))
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set(asStaff('agent'))
      .send({ odometerKm: 1000, fuelPct: 100, driverName: 'Gate Tester', licenceNumber: 'D-GATE' })
      .expect(201);

    // detail
    for (const who of ['config', 'lookup']) {
      await request(server).get(`/api/v1/rentals/${rentalRef}`).set(asStaff(who)).expect(403);
    }
    for (const who of ['admin', 'manager', 'agent', 'finance', 'fleet', 'support', 'auditor']) {
      const res = await request(server).get(`/api/v1/rentals/${rentalRef}`).set(asStaff(who));
      expect(res.status, `${who} GET rental`).toBe(200);
    }
    await request(server)
      .get(`/api/v1/rentals/${rentalRef}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    await request(server)
      .get(`/api/v1/rentals/${rentalRef}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);

    // extend (invalid body on purpose: 403 = the gate, 422 = through the gate to validation)
    const bad = { newReturnAt: 'not-a-date' };
    for (const who of ['config', 'lookup', 'finance', 'fleet', 'support', 'auditor']) {
      const res = await request(server)
        .post(`/api/v1/rentals/${rentalRef}/extend`)
        .set(asStaff(who))
        .send(bad);
      expect(res.status, `${who} extend`).toBe(403);
    }
    for (const who of ['admin', 'manager', 'agent']) {
      const res = await request(server)
        .post(`/api/v1/rentals/${rentalRef}/extend`)
        .set(asStaff(who))
        .send(bad);
      expect(res.status, `${who} extend`).toBe(422);
    }
    // the rental was not extended by any refused attempt
    const detail = await request(server)
      .get(`/api/v1/rentals/${rentalRef}`)
      .set(asStaff('admin'))
      .expect(200);
    expect(new Date(detail.body.scheduledReturnAt).toISOString()).toBe(isoIn(93));

    // leave the unit free for nothing else in this file
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/return`)
      .set(asStaff('agent'))
      .send({ odometerKm: 1100, fuelPct: 100 })
      .expect(201);
  });
});
