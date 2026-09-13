import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SCREEN-OPS-033 / FR-ADM-011 — notification template administration (content half). draft →
 * submit → publish with a content-validation gate; preview with sample values; readiness across
 * active locales; version supersede on publish.
 */
describe('notification templates (SCREEN-OPS-033 / FR-ADM-011)', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let managerToken: string;
  let agentToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    // a second config-publisher account — separation of duties (FR-ADM-006) requires a
    // different actor from the one who drafted a template to publish it, same as config-version.
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    viewerToken = (await signIn(app, 'test-config-viewer@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('config.read alone (no config.publish) can view but not draft or submit a template', async () => {
    await request(server)
      .get('/api/v1/ops/templates')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await request(server)
      .post('/api/v1/ops/templates/draft')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        key: 'reservation_confirmed',
        channel: 'email',
        localeCode: 'en',
        subject: 'x',
        bodyTemplate: 'x',
        variables: [],
      })
      .expect(403);
  });

  it('rejects a draft for an inactive/unknown locale', async () => {
    await request(server)
      .post('/api/v1/ops/templates/draft')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'reservation_confirmed',
        channel: 'email',
        localeCode: 'de',
        subject: 'x',
        bodyTemplate: 'x',
        variables: [],
      })
      .expect(422);
  });

  it('lists templates grouped by key/channel with per-locale status', async () => {
    const res = await request(server)
      .get('/api/v1/ops/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const group = (res.body as Array<{ key: string; channel: string; locales: unknown[] }>).find(
      (g) => g.key === 'reservation_confirmed' && g.channel === 'email',
    );
    expect(group).toBeTruthy();
    expect(group!.locales.length).toBe(3); // en/ar/fr
  });

  it('a rental_agent (no config.publish) cannot manage templates', async () => {
    await request(server)
      .get('/api/v1/ops/templates')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('rejects a draft that uses an undeclared variable', async () => {
    await request(server)
      .post('/api/v1/ops/templates/draft')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'reservation_confirmed',
        channel: 'email',
        localeCode: 'en',
        subject: 'Booking {{reference}} confirmed',
        bodyTemplate: 'Hi {{name}}, your total is {{grand_total}}.',
        variables: [{ name: 'reference' }, { name: 'name' }],
      })
      .expect(422);
  });

  it('draft → submit → publish supersedes the prior published version', async () => {
    const draft = await request(server)
      .post('/api/v1/ops/templates/draft')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'reservation_confirmed',
        channel: 'email',
        localeCode: 'en',
        subject: 'Your booking {{reference}} is confirmed',
        bodyTemplate: 'Hi {{name}}, booking {{reference}} is confirmed. Terms: {{terms}}',
        variables: [
          { name: 'reference' },
          { name: 'name' },
          { name: 'terms', required: true, legal: true },
        ],
      })
      .expect(201);
    expect(draft.body.status).toBe('draft');
    expect(draft.body.hasOpenDraft).toBe(true);
    const id = draft.body.id as string;

    await request(server)
      .post(`/api/v1/ops/templates/${id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // separation of duties (FR-ADM-006): the drafting actor cannot publish their own change
    const selfPublish = await request(server)
      .post(`/api/v1/ops/templates/${id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect(selfPublish.body.params?.reason).toBe('author_cannot_approve');

    const published = await request(server)
      .post(`/api/v1/ops/templates/${id}/publish`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    expect(published.body.status).toBe('published');
    expect(published.body.version).toBe('1.1'); // bumped from the seeded 1.0

    // the (key,channel,locale) now resolves to the new published version, no open draft
    const after = await request(server)
      .get('/api/v1/ops/templates/reservation_confirmed/email/en')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.version).toBe('1.1');
    expect(after.body.hasOpenDraft).toBe(false);
  });

  it('blocks publish when a required legal variable is missing from the content', async () => {
    const draft = await request(server)
      .post('/api/v1/ops/templates/draft')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'reservation_cancelled',
        channel: 'email',
        localeCode: 'en',
        subject: 'Cancelled {{reference}}',
        bodyTemplate: 'Booking {{reference}} was cancelled.',
        // declares a required legal var but never uses it → publish must fail
        variables: [{ name: 'reference' }, { name: 'refund_terms', required: true, legal: true }],
      })
      .expect(201);
    // published by a different actor than the drafter, so the failure asserted below is the
    // content-validation gate this test is actually about, not the separation-of-duties one
    await request(server)
      .post(`/api/v1/ops/templates/${draft.body.id}/publish`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(422);
  });

  it('previews with sample values and flags unresolved variables', async () => {
    const res = await request(server)
      .post('/api/v1/ops/templates/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subject: 'Hi {{name}}',
        bodyTemplate: 'Ref {{reference}} — see {{link}} — {{unknown_thing}}',
        variables: [
          { name: 'name' },
          { name: 'reference' },
          { name: 'link' },
          { name: 'unknown_thing' },
        ],
      })
      .expect(201);
    expect(res.body.subject).toBe('Hi Alex Sample');
    expect(res.body.body).toContain('RES-SAMPLE1');
    expect(res.body.missingVars).toContain('unknown_thing');
  });

  it('readiness reports every active locale for a key', async () => {
    const res = await request(server)
      .get('/api/v1/ops/templates/security_alert/email/readiness')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.perLocale.map((l: { localeCode: string }) => l.localeCode).sort()).toEqual([
      'ar',
      'en',
      'fr',
    ]);
    expect(res.body.ready).toBe(true); // all seeded + published
  });
});
