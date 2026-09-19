import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * No hard-coded "second person": whoever holds the permission can carry a change all the way to
 * live on their own. A reviewer is something an owner adds (workflow step), not a built-in rule.
 */
describe('direct publishing (no author-cannot-approve rule)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let manager: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    manager = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  const draft = (token: string, freeCancelHours: number) =>
    request(server)
      .post('/api/v1/ops/config/versions')
      .set(auth(token))
      .send({ kind: 'policy', key: 'cancellation', payload: { freeCancelHours, lateFeeBps: 1000 } })
      .expect(201);

  it('a config change goes draft → published in one step by its own author', async () => {
    const d = await draft(admin, 30);
    expect(d.body.state).toBe('draft');
    const pub = await request(server)
      .post(`/api/v1/ops/config/versions/${d.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(201);
    expect(pub.body.state).toBe('published');
    expect(pub.body.approvedBy).toBe(pub.body.createdBy); // the author published it
    expect(pub.body.effectiveFrom).toBeTruthy();
  });

  it('the optional review path still works, and the author may complete it', async () => {
    const d = await draft(admin, 31);
    await request(server)
      .post(`/api/v1/ops/config/versions/${d.body.id}/submit`)
      .set(auth(admin))
      .expect(201);
    const pub = await request(server)
      .post(`/api/v1/ops/config/versions/${d.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(201);
    expect(pub.body.state).toBe('published');
  });

  it('a different publisher can still take over someone else’s draft or review', async () => {
    const d = await draft(admin, 32);
    const pub = await request(server)
      .post(`/api/v1/ops/config/versions/${d.body.id}/approve`)
      .set(auth(manager))
      .send({})
      .expect(201);
    expect(pub.body.state).toBe('published');
  });

  it('only a draft or an in-review revision can be published; the rest still refuse', async () => {
    const d = await draft(admin, 33);
    await request(server)
      .post(`/api/v1/ops/config/versions/${d.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(201);
    // already published
    const again = await request(server)
      .post(`/api/v1/ops/config/versions/${d.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(422);
    expect(again.body.title).toMatch(/cannot be published/);
    // a rejected revision stays rejected
    const r = await draft(admin, 34);
    await request(server)
      .post(`/api/v1/ops/config/versions/${r.body.id}/submit`)
      .set(auth(admin))
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${r.body.id}/reject`)
      .set(auth(admin))
      .send({ note: 'not now' })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${r.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(422);
  });

  it('a message template’s author can publish it straight from the draft', async () => {
    const drafted = await request(server)
      .post('/api/v1/ops/templates/draft')
      .set(auth(admin))
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
    const pub = await request(server)
      .post(`/api/v1/ops/templates/${drafted.body.id}/publish`)
      .set(auth(admin))
      .expect(201);
    expect(pub.body.status).toBe('published');
  });
});
