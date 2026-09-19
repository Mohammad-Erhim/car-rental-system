import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionService } from '../src/common/auth/session.service';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { account, session } from '../src/database/schema/iam';


import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { cookieFrom } from './helpers/auth';

/**
 * Session resilience — the "never sign me out unexpectedly" contract:
 *  - the ops dashboard (staff) and the customer site keep separate sessions;
 *  - concurrent / retried refreshes are absorbed by the reuse grace window;
 *  - a replay after the window is still treated as theft;
 *  - the session has an absolute lifetime.
 */
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('session resilience', () => {
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  const ORIGIN = 'http://localhost:3000';

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
  });
  afterAll(closeTestApp);

  const signIn = async (email: string, audience: 'staff' | 'customer') => {
    const res = await request(server)
      .post('/api/v1/auth/sign-in')
      .send({ email, password: 'Test-Passw0rd!', audience })
      .expect(201);
    return {
      res,
      rt: cookieFrom(res, `carrental_rt_${audience}`),
      csrf: cookieFrom(res, `carrental_csrf_${audience}`),
    };
  };
  const refresh = (cookie: string, audience: 'staff' | 'customer' | null) => {
    const r = request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    return audience ? r.set('X-Auth-Audience', audience) : r;
  };

  it('staff and customer sign-ins set different cookies and do not overwrite each other', async () => {
    const staff = await signIn('test-agent@example.test', 'staff');
    const customer = await signIn('test-customer@example.test', 'customer');
    expect(staff.rt).toMatch(/^carrental_rt_staff=/);
    expect(customer.rt).toMatch(/^carrental_rt_customer=/);
    expect(staff.csrf).toMatch(/^carrental_csrf_staff=/);

    // a browser holding BOTH cookies: each surface refreshes its own session
    const jar = `${staff.rt}; ${customer.rt}`;
    const s = await refresh(jar, 'staff').expect(201);
    expect(s.body.actor.kind).toBe('staff');
    const rtStaff2 = cookieFrom(s, 'carrental_rt_staff');
    const c = await refresh(`${rtStaff2}; ${customer.rt}`, 'customer').expect(201);
    expect(c.body.actor.kind).toBe('customer');
  });

  it('refresh never guesses: both cookies and no audience header is refused', async () => {
    const staff = await signIn('test-agent@example.test', 'staff');
    const customer = await signIn('test-customer@example.test', 'customer');
    await refresh(`${staff.rt}; ${customer.rt}`, null).expect(401);
  });

  it('a cookie from the other audience cannot be replayed on this surface', async () => {
    const customer = await signIn('test-customer@example.test', 'customer');
    // present the customer token under the staff cookie name
    const forged = `carrental_rt_staff=${customer.rt.split('=')[1]}`;
    const res = await refresh(forged, 'staff').expect(401);
    expect(res.body.code).toBe('auth_session_expired');
    // ...and the customer session itself was not harmed by the attempt
    await refresh(customer.rt, 'customer').expect(201);
  });

  it('signing out of the customer site does not end the staff session', async () => {
    const staff = await signIn('test-agent@example.test', 'staff');
    const customer = await signIn('test-customer@example.test', 'customer');
    const out = await request(server)
      .post('/api/v1/auth/sign-out')
      .set('Cookie', `${staff.rt}; ${customer.rt}`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Audience', 'customer')
      .send({ everywhere: false })
      .expect(201);
    const cleared = (out.headers['set-cookie'] as unknown as string[]).map((c) => c.split('=')[0]);
    expect(cleared).toContain('carrental_rt_customer');
    expect(cleared).not.toContain('carrental_rt_staff');
    await refresh(customer.rt, 'customer').expect(401);
    await refresh(staff.rt, 'staff').expect(201);
  });

  it('two concurrent refreshes with the same cookie both succeed and the session survives', async () => {
    const { rt } = await signIn('test-agent@example.test', 'staff');
    const [a, b] = await Promise.all([refresh(rt, 'staff'), refresh(rt, 'staff')]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const rtA = cookieFrom(a, 'carrental_rt_staff');
    const rtB = cookieFrom(b, 'carrental_rt_staff');
    expect(rtA).not.toBe(rtB);
    // whichever cookie the browser ends up holding keeps working
    await refresh(rtA, 'staff').expect(201);
    await refresh(rtB, 'staff').expect(201);
  });

  it('a burst of many concurrent refreshes never revokes the family', async () => {
    const { rt } = await signIn('test-agent@example.test', 'staff');
    const results = await Promise.all(Array.from({ length: 8 }, () => refresh(rt, 'staff')));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
  });

  it('a retried refresh (lost response) inside the grace window still works', async () => {
    const { rt } = await signIn('test-agent@example.test', 'staff');
    await refresh(rt, 'staff').expect(201); // response "lost"
    const retry = await refresh(rt, 'staff').expect(201); // client retries with the old cookie
    await refresh(cookieFrom(retry, 'carrental_rt_staff'), 'staff').expect(201);
  });

  it('a replay AFTER the grace window is theft: 401 and the whole family is revoked', async () => {
    const { rt } = await signIn('test-agent@example.test', 'staff');
    const next = await refresh(rt, 'staff').expect(201);
    const rtNext = cookieFrom(next, 'carrental_rt_staff');

    // age the rotation past the grace window
    const hash = sha256(rt.split('=')[1]!);
    await db
      .update(session)
      .set({ revokedAt: new Date(Date.now() - 5 * 60_000).toISOString() })
      .where(eq(session.tokenHash, hash));

    await refresh(rt, 'staff').expect(401);
    await refresh(rtNext, 'staff').expect(401); // family revoked with it
  });

  it('the refresh cookie is cleared when the session is definitively dead', async () => {
    const { rt } = await signIn('test-agent@example.test', 'staff');
    await request(server)
      .post('/api/v1/auth/sign-out')
      .set('Cookie', rt)
      .set('Origin', ORIGIN)
      .set('X-Auth-Audience', 'staff')
      .send({ everywhere: false })
      .expect(201);
    const dead = await refresh(rt, 'staff').expect(401);
    const setCookie = (dead.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(setCookie.some((c) => c.startsWith('carrental_rt_staff=;'))).toBe(true);
  });

  it('the session has an absolute lifetime measured from sign-in', async () => {
    const { rt } = await signIn('test-agent@example.test', 'staff');
    const hash = sha256(rt.split('=')[1]!);
    // pretend the family was created 100 days ago (absolute cap defaults to 90)
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 100 * 86_400_000).toISOString() })
      .where(eq(session.tokenHash, hash));
    await refresh(rt, 'staff').expect(401);
  });

  it('a refresh with no session cookie is a clean 401, not a 500', async () => {
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-Auth-Audience', 'staff')
      .expect(401);
  });

  it('a suspended account cannot refresh: 401, family revoked, cookie cleared', async () => {
    const email = `susp-${Date.now()}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Susp', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    const ver = await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    const rt = cookieFrom(ver, 'carrental_rt_customer');
    await db.update(account).set({ status: 'suspended' }).where(eq(account.emailNormalized, email));
    const res = await refresh(rt, 'customer').expect(401);
    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(setCookie.some((c) => c.startsWith('carrental_rt_customer=;'))).toBe(true);
  });

  it('pruning drops old rotated rows but keeps the family start (absolute lifetime) and the live token', async () => {
    const { res, rt } = await signIn('test-agent@example.test', 'staff');
    const accountId = res.body.actor.accountId as string;
    let cookie = rt;
    for (let i = 0; i < 3; i++) {
      cookie = cookieFrom(await refresh(cookie, 'staff').expect(201), 'carrental_rt_staff');
    }
    const [first] = await db
      .select()
      .from(session)
      .where(eq(session.tokenHash, sha256(rt.split('=')[1]!)));
    const familyOf = async () =>
      db.select().from(session).where(eq(session.familyId, first!.familyId));
    const before = (await familyOf()).length; // 1 original + 3 rotations = 4
    expect(before).toBe(4);
    await db
      .update(session)
      .set({ revokedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() })
      .where(eq(session.familyId, first!.familyId));
    // (the live row is revoked too in this fixture; restore it so it is the family's live token)
    await db
      .update(session)
      .set({ revokedAt: null, revokedReason: null })
      .where(eq(session.tokenHash, sha256(cookie.split('=')[1]!)));
    await (await getTestApp()).get(SessionService).pruneAccount(accountId);
    const after = await familyOf();
    expect(after.map((r) => r.id)).toContain(first!.id); // the family's first row survives...
    expect(after.length).toBe(2); // ...plus the live one; the middle rotations are gone
    await refresh(cookie, 'staff').expect(201); // ...and the live chain still works
  });
});
