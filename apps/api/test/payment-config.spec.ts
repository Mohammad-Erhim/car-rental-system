import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// A minimal fake of the Stripe SDK — no real network call, ever, in this suite. `verifyKey()`
// (and every other adapter call) is exercised against this instead of the real Stripe API; see
// stripe-payment.adapter.test.ts for the adapter's own request/response-mapping unit coverage.
// A secret key containing "invalidkey" fails authentication; anything else succeeds — lets each
// test pick a scenario by the key string it saves, no shared mutable mock state between tests.
vi.mock('stripe', () => {
  class FakeStripe {
    constructor(private readonly key: string) {}
    balance = {
      retrieve: async () => {
        if (this.key.includes('invalidkey')) {
          throw { type: 'authentication_error', message: 'Invalid API Key provided' };
        }
        return { object: 'balance' };
      },
    };
  }
  return { default: FakeStripe };
});

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SCREEN-OPS-041 — the dashboard-configurable payment provider settings. `payment.manage` is
 * deliberately narrower than every other admin permission: it is NOT part of `manager`'s (or any
 * other role's) blanket grant, only `administrator` holds it, and every write is step-up-gated —
 * this is the one screen in the app that decides where real money goes.
 */
describe('STAGE-003 payment provider configuration', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let managerToken: string; // 'ALL' permissions, but NOT payment.manage — proves the carve-out
  let agentToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });

  afterAll(async () => closeTestApp());

  const stepUp = (token: string) =>
    request(server)
      .post('/api/v1/auth/step-up')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Test-Passw0rd!' })
      .expect(201);

  it('starts on the simulator with nothing configured, and the public mode endpoint agrees', async () => {
    const summary = await request(server)
      .get('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summary.body.activeDriver).toBe('simulator');
    expect(summary.body.test.configured).toBe(false);
    expect(summary.body.live.configured).toBe(false);
    expect(summary.body.test.webhookConfigured).toBe(false);
    expect(summary.body.live.webhookConfigured).toBe(false);

    const mode = await request(server).get('/api/v1/ops/payments/mode').expect(200);
    expect(mode.body).toEqual({ driver: 'simulator', publishableKey: null });
  });

  it('payment.manage is administrator-only — a manager (every other permission) is still refused (SRS-SEC-007-adjacent)', async () => {
    await request(server)
      .get('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ activeDriver: 'simulator' })
      .expect(403);
    await request(server)
      .get('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
    await request(server)
      .get('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('a write without a recent step-up is refused even for an administrator', async () => {
    // STEP_UP_MAX_AGE_SEC is 1s in tests, and the sign-in itself in beforeAll already counts as
    // one — let it age out so this is a genuinely stale check, not a false pass.
    await new Promise((r) => setTimeout(r, 1200));
    const res = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ test: { publishableKey: 'pk_test_x' } })
      .expect(401);
    expect(res.body.code).toBe('auth_step_up_required');
  });

  it('saving a bad Stripe secret key is rejected before anything is stored (validate-before-save)', async () => {
    await stepUp(adminToken);
    const res = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ test: { secretKey: 'sk_test_invalidkey' } })
      .expect(422);
    expect(res.body.title).toMatch(/rejected the configured API key/i);

    const summary = await request(server)
      .get('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summary.body.test.configured).toBe(false);
  });

  it('cannot switch to stripe_test before a test key is saved', async () => {
    await stepUp(adminToken);
    const res = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activeDriver: 'stripe_test' })
      .expect(422);
    expect(res.body.params?.reason).toBe('no_test_key');
  });

  it('saves a valid test key (masked in the response), switches to stripe_test, and the public mode endpoint reflects it', async () => {
    await stepUp(adminToken);
    const saved = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        test: {
          publishableKey: 'pk_test_abc',
          secretKey: 'sk_test_goodkey12345',
          webhookSecret: 'whsec_test_abc123',
        },
        activeDriver: 'stripe_test',
      })
      .expect(200);
    expect(saved.body.activeDriver).toBe('stripe_test');
    expect(saved.body.test.configured).toBe(true);
    expect(saved.body.test.secretKeyLast4.endsWith('2345')).toBe(true);
    expect(JSON.stringify(saved.body)).not.toContain('sk_test_goodkey12345');
    expect(JSON.stringify(saved.body)).not.toContain('whsec_test_abc123');
    expect(saved.body.test.verifiedAt).toBeTruthy();
    // the webhook secret has no last-4/masked echo (unlike the API secret key) — its saved
    // state is only ever visible as this boolean, which is the whole point of this fix
    expect(saved.body.test.webhookConfigured).toBe(true);
    expect(saved.body.live.webhookConfigured).toBe(false);

    const mode = await request(server).get('/api/v1/ops/payments/mode').expect(200);
    expect(mode.body).toEqual({ driver: 'stripe_test', publishableKey: 'pk_test_abc' });
  });

  it('live mode needs a live-looking key, an explicit acknowledgement, and refuses a test key by mistake', async () => {
    await stepUp(adminToken);
    // a test-shaped key rejected outright for live, even though it would pass verifyKey()
    const wrongShape = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ live: { secretKey: 'sk_test_goodkey12345' } })
      .expect(422);
    expect(wrongShape.body.params?.reason).toBe('live_key_looks_like_test');

    await stepUp(adminToken);
    // a correctly-shaped live key saves fine, but switching without acknowledging is still refused
    await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ live: { publishableKey: 'pk_live_abc', secretKey: 'sk_live_goodkey12345' } })
      .expect(200);

    await stepUp(adminToken);
    const notAcked = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activeDriver: 'stripe_live' })
      .expect(422);
    expect(notAcked.body.params?.reason).toBe('live_mode_not_acknowledged');

    await stepUp(adminToken);
    const acked = await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ live: { acknowledgeLive: true }, activeDriver: 'stripe_live' })
      .expect(200);
    expect(acked.body.activeDriver).toBe('stripe_live');
    expect(acked.body.live.acknowledged).toBe(true);

    // back to the simulator so other test files' payment flows are unaffected
    await stepUp(adminToken);
    await request(server)
      .put('/api/v1/ops/payments/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activeDriver: 'simulator' })
      .expect(200);
  });

  it('the audit trail records that config changed, never the key values themselves', async () => {
    const events = await request(server)
      .get('/api/v1/ops/audit?action=payment.config.updated')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(events.body.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(events.body)).not.toMatch(/sk_(test|live)_/);
  });
});
