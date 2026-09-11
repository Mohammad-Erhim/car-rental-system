import { randomUUID } from 'node:crypto';

import { CONSENT_POLICY_VERSION, type ConsentChoices } from '@carrental/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsentService } from '../src/modules/consent/consent.service';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * Cookie/privacy consent (public capture + ops compliance log). GDPR Art. 7 accountability: the
 * log must let ops prove exactly what a specific visitor consented to (anonymousId filter), keep
 * honest aggregate stats at any table size (SQL-computed, not JS-truncated), and page without
 * degrading as the trail grows (keyset cursor, same as the audit log). The public capture route
 * is unauthenticated, so it also needs its own abuse control and strict input validation.
 */
describe('consent capture + ops consent log', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string; // no audit.read

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  const choices = (overrides: Partial<ConsentChoices> = {}): ConsentChoices => ({
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    ...overrides,
  });

  it('TEST-CNS-001 a submitted consent choice is recorded and readable back through the ops log, field for field', async () => {
    const anonymousId = randomUUID();
    await request(server)
      .post('/api/v1/consent')
      .set('X-Forwarded-For', '203.0.113.50')
      .send({
        anonymousId,
        action: 'accept_all',
        choices: choices({ functional: true, analytics: true }),
        policyVersion: CONSENT_POLICY_VERSION,
        locale: 'en',
        page: '/en/cars',
      })
      .expect(202);

    const log = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${anonymousId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(log.body.entries).toHaveLength(1);
    const e = log.body.entries[0];
    expect(e.anonymousId).toBe(anonymousId);
    expect(e.action).toBe('accept_all');
    expect(e.choices).toEqual(choices({ functional: true, analytics: true }));
    expect(e.policyVersion).toBe(CONSENT_POLICY_VERSION);
    expect(e.staleVersion).toBe(false);
    expect(e.locale).toBe('en');
    expect(e.page).toBe('/en/cars');
    // the raw IP is never stored, only a /24 prefix — no PII beyond what's necessary
    expect(e.ipPrefix).toBe('203.0.113.0/24');
  });

  it('TEST-CNS-002 a policyVersion mismatch is flagged stale, without being rejected', async () => {
    const anonymousId = randomUUID();
    await request(server)
      .post('/api/v1/consent')
      .send({
        anonymousId,
        action: 'save_preferences',
        choices: choices(),
        policyVersion: CONSENT_POLICY_VERSION + 7,
        locale: 'fr',
      })
      .expect(202);

    const log = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${anonymousId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(log.body.entries[0].staleVersion).toBe(true);
    expect(log.body.entries[0].policyVersion).toBe(CONSENT_POLICY_VERSION + 7);
  });

  it('TEST-CNS-003 the opt-in summary is a real aggregate over the matching set, not just the page on screen', async () => {
    const anonymousId = randomUUID();
    const submit = (action: string, c: ConsentChoices) =>
      request(server)
        .post('/api/v1/consent')
        .send({
          anonymousId,
          action,
          choices: c,
          policyVersion: CONSENT_POLICY_VERSION,
          locale: 'en',
        })
        .expect(202);

    await submit('accept_all', choices({ functional: true, analytics: true, marketing: true }));
    await submit('reject_all', choices());
    await submit(
      'save_preferences',
      choices({ functional: true, analytics: false, marketing: false }),
    );

    const log = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${anonymousId}&limit=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // only 1 row on screen, but the summary still reflects all 3 matching events
    expect(log.body.entries).toHaveLength(1);
    expect(log.body.total).toBe(3);
    expect(log.body.summary.total).toBe(3);
    expect(log.body.summary.byAction).toEqual({
      accept_all: 1,
      reject_all: 1,
      save_preferences: 1,
    });
    expect(log.body.summary.optInPct.functional).toBeCloseTo((2 / 3) * 100, 1);
    expect(log.body.summary.optInPct.analytics).toBeCloseTo((1 / 3) * 100, 1);
    expect(log.body.summary.optInPct.marketing).toBeCloseTo((1 / 3) * 100, 1);
  });

  it('TEST-CNS-004 filtering by anonymousId narrows the log to one visitor — the actual GDPR "prove this visitor\'s consent" use case', async () => {
    const visitorA = randomUUID();
    const visitorB = randomUUID();
    const submit = (anonymousId: string) =>
      request(server)
        .post('/api/v1/consent')
        .send({
          anonymousId,
          action: 'accept_all',
          choices: choices({ functional: true }),
          policyVersion: CONSENT_POLICY_VERSION,
          locale: 'en',
        })
        .expect(202);
    await submit(visitorA);
    await submit(visitorB);
    await submit(visitorB); // visitor B changed their mind twice

    const logA = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${visitorA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(logA.body.total).toBe(1);
    expect(
      logA.body.entries.every((e: { anonymousId: string }) => e.anonymousId === visitorA),
    ).toBe(true);

    const logB = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${visitorB}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(logB.body.total).toBe(2);
  });

  it('TEST-CNS-005 the consent log paginates by keyset cursor — no overlap, no gaps, honest total at any depth', async () => {
    const app = await getTestApp();
    const consent = app.get(ConsentService);
    const anonymousId = randomUUID();
    // seed directly through the service (bypasses the public route's rate limit) — 5 rows under
    // one visitor so paging at limit=2 forces 3 pages
    for (let i = 0; i < 5; i++) {
      await consent.record(
        {
          anonymousId,
          action: 'save_preferences',
          choices: choices({ functional: i % 2 === 0 }),
          policyVersion: CONSENT_POLICY_VERSION,
          locale: 'en',
        },
        {},
      );
    }

    const page1 = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${anonymousId}&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(page1.body.entries).toHaveLength(2);
    expect(page1.body.total).toBe(5);
    expect(typeof page1.body.nextCursor).toBe('string');

    const page2 = await request(server)
      .get(
        `/api/v1/ops/consent/log?anonymousId=${anonymousId}&limit=2&cursor=${page1.body.nextCursor}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(page2.body.entries).toHaveLength(2);
    const ids1 = new Set(page1.body.entries.map((e: { id: string }) => e.id));
    for (const e of page2.body.entries as Array<{ id: string }>) expect(ids1.has(e.id)).toBe(false);

    // an unrecognisable cursor degrades to "start over" rather than a crash or a wrong page
    const garbage = await request(server)
      .get(`/api/v1/ops/consent/log?anonymousId=${anonymousId}&limit=2&cursor=not-a-real-cursor`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(garbage.body.entries).toEqual(page1.body.entries);

    // walking every page reaches the end with the full set, no more no less
    let cursor: string | undefined;
    let seen = 0;
    let guard = 0;
    do {
      const qs = new URLSearchParams({ anonymousId, limit: '2' });
      if (cursor) qs.set('cursor', cursor);
      const res = await request(server)
        .get(`/api/v1/ops/consent/log?${qs}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      seen += res.body.entries.length;
      cursor = res.body.nextCursor ?? undefined;
      guard += 1;
    } while (cursor && guard < 20);
    expect(seen).toBe(5);
  });

  it('TEST-CNS-006 the ops consent log is gated behind audit.read; the public capture route needs no auth', async () => {
    await request(server).get('/api/v1/ops/consent/log').expect(401);
    await request(server)
      .get('/api/v1/ops/consent/log')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
    await request(server)
      .get('/api/v1/ops/consent/log')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('TEST-CNS-007 malformed consent submissions are rejected, not silently coerced', async () => {
    // necessary must be exactly `true` — it isn't optional-out
    await request(server)
      .post('/api/v1/consent')
      .send({
        anonymousId: randomUUID(),
        action: 'accept_all',
        choices: { necessary: false, functional: true, analytics: true, marketing: true },
        policyVersion: CONSENT_POLICY_VERSION,
        locale: 'en',
      })
      .expect(422);

    // anonymousId must be a real uuid — not an arbitrary client-supplied string
    await request(server)
      .post('/api/v1/consent')
      .send({
        anonymousId: 'not-a-uuid',
        action: 'accept_all',
        choices: choices(),
        policyVersion: CONSENT_POLICY_VERSION,
        locale: 'en',
      })
      .expect(422);

    // an unrecognised action is refused, not stored as free text
    await request(server)
      .post('/api/v1/consent')
      .send({
        anonymousId: randomUUID(),
        action: 'opt_out_everything',
        choices: choices(),
        policyVersion: CONSENT_POLICY_VERSION,
        locale: 'en',
      })
      .expect(422);

    // a negative policyVersion is refused
    await request(server)
      .post('/api/v1/consent')
      .send({
        anonymousId: randomUUID(),
        action: 'accept_all',
        choices: choices(),
        policyVersion: -1,
        locale: 'en',
      })
      .expect(422);
  });
});
