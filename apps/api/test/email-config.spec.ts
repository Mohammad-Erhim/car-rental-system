import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// A minimal fake of nodemailer — no real network/SMTP connection, ever, in this suite. A host
// containing "invalidhost" fails `verify()`/`sendMail()`; anything else succeeds — lets each test
// pick a scenario by the host string it saves, no shared mutable mock state between tests.
const sentMail: Array<{ to: string; subject?: string; html?: string }> = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opts: { host: string }) => ({
      verify: async () => {
        if (opts.host.includes('invalidhost')) {
          throw new Error('getaddrinfo ENOTFOUND invalidhost');
        }
        return true;
      },
      sendMail: async (mail: { to: string; subject?: string; html?: string }) => {
        if (opts.host.includes('invalidhost')) {
          throw new Error('getaddrinfo ENOTFOUND invalidhost');
        }
        sentMail.push(mail);
        return { messageId: 'fake-message-id' };
      },
      close: () => {},
    }),
  },
}));

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * The dashboard-configurable email provider settings — mirrors payment-config.spec.ts.
 * `email.manage` is deliberately narrower than every other admin permission: NOT part of
 * `manager`'s blanket grant, only `administrator` holds it, and every write is step-up-gated.
 */
describe('email provider configuration', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let managerToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
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

  it('starts on the outbox driver with nothing configured', async () => {
    const summary = await request(server)
      .get('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summary.body.activeDriver).toBe('outbox');
    expect(summary.body.smtp.configured).toBe(false);
  });

  it('email.manage is administrator-only — a manager (every other permission) is still refused', async () => {
    await request(server)
      .get('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    await request(server)
      .put('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ activeDriver: 'outbox' })
      .expect(403);
    await request(server)
      .get('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('a write without a recent step-up is refused even for an administrator', async () => {
    await new Promise((r) => setTimeout(r, 1200));
    const res = await request(server)
      .put('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ smtp: { host: 'smtp.example.test' } })
      .expect(401);
    expect(res.body.code).toBe('auth_step_up_required');
  });

  it('saving a bad SMTP host is rejected before anything is stored (validate-before-save)', async () => {
    await stepUp(adminToken);
    const res = await request(server)
      .put('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ smtp: { host: 'invalidhost.example.test', port: 587 } })
      .expect(422);
    expect(res.body.params?.reason).toBe('invalid_smtp_config');

    const summary = await request(server)
      .get('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summary.body.smtp.configured).toBe(false);
  });

  it('cannot switch to smtp before a host/port/from-address is saved', async () => {
    await stepUp(adminToken);
    const res = await request(server)
      .put('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activeDriver: 'smtp' })
      .expect(422);
    expect(res.body.params?.reason).toBe('incomplete_smtp_config');
  });

  it('rejects a fromName/fromAddress containing header-injection characters (defense against From-header injection)', async () => {
    for (const fromName of ['Car Rental\r\nBcc: evil@example.test', 'Car "Rental" Co', 'x\x00y']) {
      await stepUp(adminToken);
      const res = await request(server)
        .put('/api/v1/ops/email/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtp: { fromName } })
        .expect(422);
      expect(res.body.fieldErrors?.length).toBeGreaterThan(0);
    }
    for (const fromAddress of ['a@b.test\r\nBcc: evil@example.test', 'a@b"@example.test']) {
      await stepUp(adminToken);
      await request(server)
        .put('/api/v1/ops/email/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtp: { fromAddress } })
        .expect(422);
    }
  });

  it('saves valid SMTP settings (password masked in the response), switches to smtp, and NotifyService actually sends through it', async () => {
    await stepUp(adminToken);
    const saved = await request(server)
      .put('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        activeDriver: 'smtp',
        smtp: {
          host: 'smtp.example.test',
          port: 587,
          secure: false,
          username: 'apikey',
          password: 'super-secret-smtp-password',
          fromAddress: 'noreply@example.test',
          fromName: 'Car Rental',
        },
      })
      .expect(200);
    expect(saved.body.activeDriver).toBe('smtp');
    expect(saved.body.smtp.configured).toBe(true);
    expect(saved.body.smtp.passwordLast4).toBe('••••••••••••••••••••••word');
    expect(saved.body.smtp.verifiedAt).toBeTruthy();

    // Trigger a real notification send (customer sign-in already fires one) and confirm the
    // fake SMTP transport actually received a message — not just that the config saved.
    const before = sentMail.length;
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `smtp-check-${Date.now()}@example.test`,
        password: 'Test-Passw0rd!',
        fullName: 'SMTP Check',
        localeCode: 'en',
        acceptTerms: true,
      })
      .expect(201);
    expect(sentMail.length).toBeGreaterThan(before);
  });

  it('switching back to outbox stops real sends', async () => {
    await stepUp(adminToken);
    const res = await request(server)
      .put('/api/v1/ops/email/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activeDriver: 'outbox' })
      .expect(200);
    expect(res.body.activeDriver).toBe('outbox');

    const before = sentMail.length;
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `outbox-check-${Date.now()}@example.test`,
        password: 'Test-Passw0rd!',
        fullName: 'Outbox Check',
        localeCode: 'en',
        acceptTerms: true,
      })
      .expect(201);
    expect(sentMail.length).toBe(before);
  });
});
