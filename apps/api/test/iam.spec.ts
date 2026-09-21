import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { cookieFrom, signIn } from './helpers/auth';

/**
 * TEST-IAM-001..008 (STAGE-001). Register → verify → session; sign-in lockout; refresh rotation
 * + reuse detection; recovery single-use + session invalidation; staff audience enforcement;
 * permission denial (horizontal + vertical).
 */
describe('IAM / auth', () => {
  let server: ReturnType<typeof httpServer>;
  const uniq = Date.now();

  beforeAll(async () => {
    server = httpServer(await getTestApp());
  });
  afterAll(closeTestApp);

  it('TEST-IAM-001/002 register → verify email → active session', async () => {
    const email = `newcust-${uniq}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'New Customer',
        email,
        password: 'Sup3rSecret!!',
        localeCode: 'en',
        acceptTerms: true,
        marketingOptIn: false,
      })
      .expect(201);
    expect(reg.body.challengeId).toBeTruthy();
    expect(reg.body.devCode).toMatch(/^\d{6}$/); // dev outbox exposes the code

    // wrong code first
    await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: '000000' })
      .expect(422);

    const verify = await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.actor.emailVerified).toBe(true);
    expect(verify.body.actor.kind).toBe('customer');
    expect(cookieFrom(verify, 'carrental_rt_customer')).toMatch(/^carrental_rt_customer=/);

    // /auth/me works with the access token
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${verify.body.accessToken}`)
      .expect(200);
    expect(me.body.actor.accountId).toBe(verify.body.actor.accountId);
    expect(me.body.profile.email).toBe(email);
  });

  it('register rejects a returnTo that is not a same-origin relative path', async () => {
    const email = `redirect-${uniq}@example.test`;
    const bad = await request(server)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Redirect Test',
        email,
        password: 'Sup3rSecret!!',
        acceptTerms: true,
        returnTo: 'https://evil.example/phish',
      })
      .expect(422);
    expect(bad.body.fieldErrors?.[0]?.path).toBe('returnTo');

    await request(server)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Redirect Test',
        email,
        password: 'Sup3rSecret!!',
        acceptTerms: true,
        returnTo: '/checkout?step=review',
      })
      .expect(201);
  });

  it('TEST-IAM-001 duplicate registration routes to sign-in, does not create a second account', async () => {
    const email = `dupe-${uniq}@example.test`;
    await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'A', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'A', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(422);
    expect(res.body.params?.reason).toBe('account_exists');
  });

  it('TEST-IAM-003 refresh rotates; the rotated token yields a fresh one; a dead family stays dead', async () => {
    const first = await request(server)
      .post('/api/v1/auth/sign-in')
      .send({ email: 'test-agent@example.test', password: 'Test-Passw0rd!', audience: 'staff' })
      .expect(201);
    const rt1 = cookieFrom(first, 'carrental_rt_staff');

    // CsrfGuard requires either an allowed Origin or the double-submit token on a cookie-authed
    // write; a real browser always sends Origin on a same-origin POST, so simulate that here
    // rather than the double-submit dance (already covered by security.spec.ts's own CSRF tests).
    const origin = 'http://localhost:3000';
    const r2 = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rt1)
      .set('Origin', origin)
      .set('X-Auth-Audience', 'staff')
      .expect(201);
    const rt2 = cookieFrom(r2, 'carrental_rt_staff');
    expect(rt2).not.toBe(rt1);

    // sign-out kills the chain; even inside the grace window the old token must not resurrect it
    await request(server)
      .post('/api/v1/auth/sign-out')
      .set('Cookie', rt2)
      .set('Origin', origin)
      .set('X-Auth-Audience', 'staff')
      .send({ everywhere: false })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rt1)
      .set('Origin', origin)
      .set('X-Auth-Audience', 'staff')
      .expect(401);
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rt2)
      .set('Origin', origin)
      .set('X-Auth-Audience', 'staff')
      .expect(401);
  });

  it('TEST-IAM-004 recovery: neutral response, single-use code, sessions invalidated', async () => {
    const email = `recover-${uniq}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'R', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    const session = await signIn(await getTestApp(), email, 'Sup3rSecret!!');

    // unknown email -> same neutral shape, no challenge
    const unknown = await request(server)
      .post('/api/v1/auth/recovery/start')
      .send({ email: `nobody-${uniq}@example.test` })
      .expect(201);
    expect(unknown.body.challengeId).toBeNull();
    expect(unknown.body.message).toMatch(/if an account matches/i);

    const start = await request(server)
      .post('/api/v1/auth/recovery/start')
      .send({ email })
      .expect(201);
    expect(start.body.challengeId).toBeTruthy();

    await request(server)
      .post('/api/v1/auth/recovery/complete')
      .send({
        challengeId: start.body.challengeId,
        code: start.body.devCode,
        newPassword: 'BrandN3wPass!!',
      })
      .expect(201);

    // the recovery code cannot be used again
    await request(server)
      .post('/api/v1/auth/recovery/complete')
      .send({
        challengeId: start.body.challengeId,
        code: start.body.devCode,
        newPassword: 'Another1!!x',
      })
      .expect(422);

    // old session's refresh token is dead. Origin set for the same reason as TEST-IAM-003 above —
    // a real browser sends it on a same-origin POST; supertest doesn't unless told to.
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .set('Origin', 'http://localhost:3000')
      .expect(401);

    // new password works
    await signIn(await getTestApp(), email, 'BrandN3wPass!!');
  });

  it('TEST-IAM-006 profile: optimistic concurrency on update', async () => {
    const email = `prof-${uniq}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'P', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    const v = await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    const token = v.body.accessToken as string;

    const p0 = await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(server)
      .post('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .set('If-Match', String(p0.body.version))
      .send({ fullName: 'Renamed', localeCode: 'fr' })
      .expect(201);

    // stale version -> 409 with currentVersion
    const stale = await request(server)
      .post('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .set('If-Match', String(p0.body.version))
      .send({ fullName: 'Again' })
      .expect(409);
    expect(stale.body.code).toBe('version_conflict');
    expect(stale.body.currentVersion).toBeGreaterThan(p0.body.version);
  });

  it('TEST-IAM-006 profile: two genuinely concurrent saves at the same starting version cannot both win', async () => {
    const email = `prof-race-${uniq}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: 'P', email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    const v = await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    const token = v.body.accessToken as string;

    const p0 = await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // fired concurrently against the SAME starting version — a sequential await-then-await (as
    // above) wouldn't exercise the actual UPDATE...WHERE race.
    const [a, b] = await Promise.allSettled([
      request(server)
        .post('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', String(p0.body.version))
        .send({ fullName: 'Race A' }),
      request(server)
        .post('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', String(p0.body.version))
        .send({ fullName: 'Race B' }),
    ]);

    const results = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
    expect(results.filter((s) => s === 201)).toHaveLength(1);
    expect(results.filter((s) => s === 409)).toHaveLength(1);
    const loser = [a, b].find((r) => r.status === 'fulfilled' && r.value.status === 409) as
      | PromiseFulfilledResult<request.Response>
      | undefined;
    expect(loser?.value.body.code).toBe('version_conflict');

    const after = await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(['Race A', 'Race B']).toContain(after.body.fullName);
    expect(after.body.version).toBe(p0.body.version + 1);
  });

  it('TEST-IAM-008 a closure request with nothing open is received, not blocked — and asking twice is one request', async () => {
    // DEC-041: closure used to be created "blocked" by a placeholder retention blocker, always, and
    // nothing could ever complete it. Now it is blocked only by what is really open (a current or
    // upcoming reservation or rental, an unresolved payment issue) — see privacy.spec.ts for those.
    const s = await signIn(await getTestApp(), 'test-customer@example.test', 'Test-Passw0rd!');
    const res = await request(server)
      .post('/api/v1/auth/data-requests')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ kind: 'closure' })
      .expect(201);
    expect(res.body.status).toBe('received');
    expect(res.body.blockers).toEqual([]);
    expect(res.body.dueAt).toBeTruthy();
    const again = await request(server)
      .post('/api/v1/auth/data-requests')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ kind: 'closure' })
      .expect(201);
    expect(again.body.id).toBe(res.body.id);
  });

  it('permission denial: an unauthenticated request to a protected route is 401; a customer hitting staff routes is 403', async () => {
    await request(server).get('/api/v1/admin/staff').expect(401);
    const cust = await signIn(await getTestApp(), 'test-customer@example.test', 'Test-Passw0rd!');
    await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${cust.accessToken}`)
      .expect(403);
  });
});
