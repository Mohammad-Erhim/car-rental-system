import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-007 — consolidated security pass (TEST-SEC-001..017). Token rotation / reuse and
 * recovery single-use are already proven in `iam.spec.ts`; this suite adds the release-hardening
 * checks: rate limiting, CORS allow-listing, CSRF defense for cookie-authed writes, a vertical
 * authorization sweep of the ops surface, scope isolation, approval separation, injection / mass
 * assignment, audit coverage, and error-envelope redaction.
 */
describe('STAGE-007 security', () => {
  let server: ReturnType<typeof httpServer>;
  let agentToken: string; // rental_agent — no config/report/audit/pricing permissions
  let adminToken: string;
  let managerToken: string;
  let scopedToken: string;
  let customerToken: string;
  let viewerToken: string; // config.read only — no config.publish

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    scopedToken = (await signIn(app, 'test-scoped@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
    viewerToken = (await signIn(app, 'test-config-viewer@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  // ---- TEST-SEC-015: abuse / rate controls ----

  it('TEST-SEC-015 an auth-route burst from one client is rate-limited (429 + Retry-After)', async () => {
    const ip = `198.51.100.${1 + Math.floor(Math.random() * 200)}`;
    // Bind the in-process server once up front so `supertest` reuses a single listening port —
    // firing many requests at a non-listening server makes each call `server.listen(0)` and they
    // race (ECONNRESET). With a bound port the burst can go out *concurrently* so it lands in as
    // few of the limiter's fixed 2s windows (`RATE_LIMIT_AUTH_WINDOW_SEC`) as possible: a slow
    // host spreads a *sequential* loop across two windows and neither exceeds the cap of 25
    // (`RATE_LIMIT_AUTH_MAX`). 60 in flight means even a worst-case boundary split (30 / 30)
    // still puts one window over 25 → at least one 429.
    if (!server.listening) {
      await new Promise<void>((res) => server.listen(0, () => res()));
    }
    const results = await Promise.all(
      Array.from({ length: 60 }, () =>
        request(server)
          .post('/api/v1/auth/resend-verification')
          .set('X-Forwarded-For', ip)
          .send({ accountId: randomUUID() }),
      ),
    );
    const limited = results.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]!.headers['retry-after']).toBeTruthy();
    expect(limited[0]!.body.code).toBe('rate_limited');
    // a different client IP is unaffected
    await request(server)
      .post('/api/v1/auth/resend-verification')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ accountId: randomUUID() })
      .then((r) => expect(r.status).not.toBe(429));
  }, 60_000);

  it('TEST-SEC-015 rotating the client-supplied X-Forwarded-For entry no longer bypasses the limit', async () => {
    // `app.set('trust proxy', 1)` trusts exactly one hop back from the socket — in production,
    // nginx *appends* the true client IP rather than replacing the header, so the header Node
    // actually sees is `<attacker-supplied>, <nginx's real view>`. The rightmost entry is what
    // `req.ip` resolves to; the leftmost is attacker-controlled and must be ignored. Simulate that
    // shape directly (a bare single-value header behaves identically before/after this fix, so it
    // can't exercise the bug either way — this needs a genuine two-hop header).
    if (!server.listening) {
      await new Promise<void>((res) => server.listen(0, () => res()));
    }
    const realIp = `198.51.100.${1 + Math.floor(Math.random() * 200)}`;
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        request(server)
          .post('/api/v1/auth/resend-verification')
          // a different, freely-chosen leftmost value on every single request — if that were
          // still trusted, each request would land in its own bucket and none would ever hit
          // the cap; because the trusted rightmost value is constant, they all share one bucket.
          .set('X-Forwarded-For', `203.0.113.${i}, ${realIp}`)
          .send({ accountId: randomUUID() }),
      ),
    );
    const limited = results.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThan(0);
  }, 60_000);

  it('TEST-SEC-015 the public consent-capture route has its own burst limit, independent of the auth bucket', async () => {
    const ip = `198.51.100.${1 + Math.floor(Math.random() * 200)}`;
    if (!server.listening) {
      await new Promise<void>((res) => server.listen(0, () => res()));
    }
    // limit is 20/60s (consent-submit bucket) — 30 concurrent requests from one IP guarantees at
    // least one 429 regardless of how the burst lands across the fixed window.
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        request(server)
          .post('/api/v1/consent')
          .set('X-Forwarded-For', ip)
          .send({
            anonymousId: randomUUID(),
            action: 'accept_all',
            choices: { necessary: true, functional: true, analytics: true, marketing: true },
            policyVersion: 1,
            locale: 'en',
          }),
      ),
    );
    const limited = results.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]!.headers['retry-after']).toBeTruthy();
    expect(limited[0]!.body.code).toBe('rate_limited');
    // a different client IP is unaffected
    await request(server)
      .post('/api/v1/consent')
      .set('X-Forwarded-For', '203.0.113.77')
      .send({
        anonymousId: randomUUID(),
        action: 'accept_all',
        choices: { necessary: true, functional: true, analytics: true, marketing: true },
        policyVersion: 1,
        locale: 'en',
      })
      .then((r) => expect(r.status).not.toBe(429));
  }, 60_000);

  // ---- TEST-SEC-015: CORS allow-list ----

  it('TEST-SEC-015 CORS does not reflect a disallowed origin', async () => {
    const bad = await request(server)
      .get('/api/v1/meta/locales')
      .set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).not.toBe('https://evil.example');

    const preflight = await request(server)
      .options('/api/v1/auth/sign-in')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).not.toBe('https://evil.example');

    const ok = await request(server)
      .get('/api/v1/meta/locales')
      .set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  // ---- TEST-SEC-003: browser refresh cookie + CSRF ----

  it('TEST-SEC-003 the refresh cookie is HttpOnly, SameSite=Lax, path-scoped', async () => {
    const res = await request(server)
      .post('/api/v1/auth/sign-in')
      .send({
        email: 'test-customer@example.test',
        password: 'Test-Passw0rd!',
        audience: 'customer',
      })
      .expect(201);
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('carrental_rt='),
    )!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\/api\/v1\/auth/i);
  });

  it('TEST-SEC-003 a cookie-authed write from a foreign origin is refused; same-origin passes', async () => {
    const signedIn = await request(server)
      .post('/api/v1/auth/sign-in')
      .send({
        email: 'test-customer@example.test',
        password: 'Test-Passw0rd!',
        audience: 'customer',
      })
      .expect(201);
    const rt = (signedIn.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('carrental_rt='))!
      .split(';')[0]!;

    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rt)
      .set('Origin', 'https://evil.example')
      .expect(403);

    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rt)
      .set('Origin', 'http://localhost:3000')
      .expect(201);
  });

  it('TEST-SEC-003 a cookie-authed write with neither Origin nor Referer is refused by default, not silently allowed', async () => {
    const signedIn = await request(server)
      .post('/api/v1/auth/sign-in')
      .send({
        email: 'test-customer@example.test',
        password: 'Test-Passw0rd!',
        audience: 'customer',
      })
      .expect(201);
    const setCookies = signedIn.headers['set-cookie'] as unknown as string[];
    const rt = setCookies.find((c) => c.startsWith('carrental_rt='))!.split(';')[0]!;
    const csrfCookieHeader = setCookies.find((c) => c.startsWith('carrental_csrf='))!;
    expect(csrfCookieHeader).not.toMatch(/HttpOnly/i); // must be JS-readable to be double-submitted
    const csrfCookie = csrfCookieHeader.split(';')[0]!;
    const csrfValue = csrfCookie.split('=')[1]!;

    // neither header at all — previously fell through the old `if (origin && ...)` check and
    // passed untouched; must now require the double-submit token like any other unverified origin.
    await request(server).post('/api/v1/auth/refresh').set('Cookie', rt).expect(403);

    // the matching double-submit token (cookie + header) is what actually lets it through.
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${rt}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfValue)
      .expect(201);
  });

  // ---- TEST-SEC-007: vertical authorization sweep ----

  const opsRoutes: Array<{ method: 'get' | 'post'; path: string; body?: unknown }> = [
    { method: 'get', path: '/api/v1/ops/config/versions?kind=policy' },
    {
      method: 'post',
      path: '/api/v1/ops/config/versions',
      body: { kind: 'policy', key: 'x', payload: {} },
    },
    { method: 'get', path: '/api/v1/ops/reports' },
    { method: 'post', path: '/api/v1/ops/reports/fleet_utilisation/run', body: {} },
    { method: 'get', path: '/api/v1/ops/audit' },
    {
      method: 'post',
      path: '/api/v1/ops/pricing/rate-plans',
      body: { categoryCode: 'economy', name: 'x', effectiveFrom: '2020-01-01', baseDayMinor: 1000 },
    },
  ];

  const hit = (r: (typeof opsRoutes)[number], token?: string) => {
    const base = request(server)[r.method](r.path);
    return (token ? base.set('Authorization', `Bearer ${token}`) : base).send(r.body ?? {});
  };

  it('TEST-SEC-007 anonymous is 401 on every ops route', async () => {
    for (const r of opsRoutes) {
      const res = await hit(r);
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it('TEST-SEC-007 a rental_agent (wrong permissions) is 403 on every ops admin route', async () => {
    for (const r of opsRoutes) {
      const res = await hit(r, agentToken);
      expect(res.status, `${r.method} ${r.path}`).toBe(403);
    }
  });

  it('TEST-SEC-007 a customer token cannot reach staff routes', async () => {
    const res = await request(server)
      .get('/api/v1/ops/reports')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('TEST-SEC-007 config.read alone can view config versions but not draft/submit/delete one', async () => {
    await request(server)
      .get('/api/v1/ops/config/versions?kind=policy')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    const forbidden = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ kind: 'policy', key: 'x', payload: {} })
      .expect(403);
    expect(forbidden.body.code).toBe('forbidden');

    // an actual draft (by a publisher) still can't be submitted or deleted by a viewer
    const draft = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 6, lateFeeBps: 250 },
      })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
    await request(server)
      .delete(`/api/v1/ops/config/versions/${draft.body.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
  });

  // ---- TEST-SEC-008: scope isolation ----

  it('TEST-SEC-008 a location-scoped operator cannot widen scope via a request param', async () => {
    // `params.locationCode` is a deliberate feature (narrow within the actor's own scope, for the
    // dashboard/reports location switcher) — but TST2 is outside this actor's own scope (TST1
    // only), so the request is rejected outright with a 403, never silently narrowed to nothing
    // (let alone falling back to, or widening into, the actor's full scope or the org-wide view).
    // The bogus `scope` array alongside it is not a recognized param at all and must have zero
    // effect either way.
    const scoped = await request(server)
      .post('/api/v1/ops/reports/reservations_by_state/run')
      .set('Authorization', `Bearer ${scopedToken}`)
      .send({ params: { locationCode: 'TST2', scope: ['TST1', 'TST2'] } })
      .expect(403);
    expect(scoped.body.title).toMatch(/don't have access/i);

    // no narrowing requested at all — still confined to the actor's own scope, not widened
    const scopedOwn = await request(server)
      .post('/api/v1/ops/reports/reservations_by_state/run')
      .set('Authorization', `Bearer ${scopedToken}`)
      .send({})
      .expect(201);
    expect(scopedOwn.body.scopeNote).toBe('Scoped to TST1');

    const org = await request(server)
      .post('/api/v1/ops/reports/reservations_by_state/run')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(org.body.scopeNote).toBe('All locations');
  });

  // ---- TEST-SEC-010: approval requester / approver separation ----

  it('TEST-SEC-010 the author of a config draft cannot approve it', async () => {
    const draft = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 12, lateFeeBps: 500 },
      })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    const self = await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(403);
    expect(self.body.code).toBe('approval_required');
    // a different publisher can
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
  });

  // ---- TEST-SEC-011: injection / mass assignment / malformed input ----

  it('TEST-SEC-011 a SQL-ish filter value is treated as data, not executed', async () => {
    const res = await request(server)
      .get(`/api/v1/ops/audit?action=${encodeURIComponent("' OR '1'='1")}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // `/ops/audit` returns `{ entries, total, nextCursor }`, not a bare array (this assertion
    // predates that shape and was silently stale — caught while running the full suite) — the
    // injection-safety property being tested is unchanged: a nonsense filter matches nothing.
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBe(0);
    expect(res.body.total).toBe(0);
  });

  it('TEST-SEC-011 unexpected body fields are ignored (no mass assignment); malformed JSON is a 4xx', async () => {
    const draft = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'fuel_rate',
        payload: { minorPerPct: 200 },
        state: 'published', // attempt to jump the workflow
        approvedBy: adminToken,
        id: '00000000-0000-0000-0000-000000000000',
      })
      .expect(201);
    expect(draft.body.state).toBe('draft'); // ignored — created as a draft
    expect(draft.body.id).not.toBe('00000000-0000-0000-0000-000000000000');

    const malformed = await request(server)
      .post('/api/v1/auth/sign-in')
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', '203.0.113.55')
      .send('{"email": "x"'); // truncated JSON
    expect(malformed.status).toBeGreaterThanOrEqual(400);
    expect(malformed.status).toBeLessThan(500);
  });

  // ---- TEST-SEC-016: audit coverage of policy publication + auth ----

  it('TEST-SEC-016 config publication and sign-in are audited', async () => {
    const audit = await request(server)
      .get('/api/v1/ops/audit?targetType=config_version')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // `/ops/audit` returns `{ entries, total, nextCursor }` — this assertion predates that shape
    // and was silently stale (caught while running the full suite), unrelated to today's change.
    expect(
      (audit.body.entries as Array<{ action: string }>).some(
        (r) => r.action === 'config.version.approved',
      ),
    ).toBe(true);
  });

  // ---- TEST-SEC-017: error envelope / redaction ----

  it('TEST-SEC-017 the error envelope never echoes credentials or tokens', async () => {
    const res = await request(server)
      .post('/api/v1/auth/sign-in')
      .set('X-Forwarded-For', '203.0.113.77')
      .set('Authorization', 'Bearer super-secret-token-value')
      .send({
        email: 'nobody@example.test',
        password: 'hunter2-please-do-not-leak',
        audience: 'customer',
      })
      .expect(401);
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain('hunter2-please-do-not-leak'); // the submitted password value
    expect(blob).not.toContain('super-secret-token-value'); // the Authorization header value
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('sql');
    expect(res.body).not.toHaveProperty('query');
    expect(res.body.code).toBe('auth_invalid_credentials');
  });
});
