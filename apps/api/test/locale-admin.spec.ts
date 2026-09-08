import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-010 — Languages admin (SRS-I18N-001, DEC-024). A locale can be added, activated, and
 * made default from the dashboard with no code change; `GET /meta/locales` reflects it.
 */
describe('locale administration', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('the three launch locales are production (not testOnly) — DEC-024', async () => {
    const res = await request(server).get('/api/v1/meta/locales').expect(200);
    expect(res.body.locales.map((l: { code: string }) => l.code).sort()).toEqual([
      'ar',
      'en',
      'fr',
    ]);
    expect(res.body.locales.every((l: { testOnly: boolean }) => l.testOnly === false)).toBe(true);
  });

  it('add → activate a new locale; it then appears in the public list', async () => {
    await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'de', nativeName: 'Deutsch', englishName: 'German', direction: 'ltr' })
      .expect(201);

    // inactive until activated → not in the public list yet
    let pub = await request(server).get('/api/v1/meta/locales').expect(200);
    expect(pub.body.locales.some((l: { code: string }) => l.code === 'de')).toBe(false);

    await request(server)
      .post('/api/v1/config/locales/de/activate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    pub = await request(server).get('/api/v1/meta/locales').expect(200);
    const de = pub.body.locales.find((l: { code: string }) => l.code === 'de');
    expect(de).toMatchObject({ code: 'de', direction: 'ltr', testOnly: false });

    // admin list includes inactive too
    const all = await request(server)
      .get('/api/v1/config/locales')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(all.body.some((l: { code: string }) => l.code === 'de')).toBe(true);

    // clean up so other specs see the original set
    await request(server)
      .post('/api/v1/config/locales/de/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('rejects a malformed BCP-47 code and forbids a non-publisher', async () => {
    await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'Not a code!', nativeName: 'x', englishName: 'x', direction: 'ltr' })
      .expect(422);

    await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ code: 'it', nativeName: 'Italiano', englishName: 'Italian', direction: 'ltr' })
      .expect(403);
  });

  it('the default locale cannot be deactivated', async () => {
    const res = await request(server)
      .post('/api/v1/config/locales/en/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(res.body.params?.reason).toBe('is_default');
  });
});
