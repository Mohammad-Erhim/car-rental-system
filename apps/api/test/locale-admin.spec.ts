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

    // a dashboard-added locale can now receive + serve published strings (DEC-024)
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'common',
        key: 'action.search',
        localeCode: 'de',
        value: 'Suchen',
        status: 'published',
      })
      .expect(201);
    const bundle = await request(server)
      .get('/api/v1/meta/translations?namespace=common&locale=de')
      .expect(200);
    expect(bundle.body['action.search']).toBe('Suchen');

    // clean up so other specs see the original set
    await request(server)
      .post('/api/v1/config/locales/de/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('guards the default: its direction is locked, and an untranslated language needs force', async () => {
    // flipping the default locale's writing direction is refused
    const flip = await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'en', nativeName: 'English', englishName: 'English', direction: 'rtl' })
      .expect(422);
    expect(flip.body.params?.reason).toBe('default_direction_locked');

    // making a language with no published strings the default needs confirmation
    await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'pt', nativeName: 'Português', englishName: 'Portuguese', direction: 'ltr' })
      .expect(201);
    const blocked = await request(server)
      .post('/api/v1/config/locales/pt/default')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(blocked.body.params?.reason).toBe('default_locale_untranslated');

    await request(server)
      .post('/api/v1/config/locales/pt/default?force=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // put it back so other specs see `en` as default
    await request(server)
      .post('/api/v1/config/locales/en/default')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(server)
      .post('/api/v1/config/locales/pt/deactivate')
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
