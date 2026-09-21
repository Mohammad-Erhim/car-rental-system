import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * DEC-037 — text a dashboard user types on a branch or an extra is translatable on the
 * Translations screen (namespaces `catalogue:location` / `catalogue:product`), seeded in French
 * and Arabic like categories and features, and served in the customer's language.
 */
describe('translatable branches and extras (DEC-037)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
  });
  afterAll(closeTestApp);

  const location = async (code: string, locale?: string) =>
    (
      (
        await request(server)
          .get(`/api/v1/config/locations${locale ? `?locale=${locale}` : ''}`)
          .expect(200)
      ).body as Array<{ code: string; name: string }>
    ).find((l) => l.code === code)!;

  const productName = async (code: string, locale?: string) =>
    (
      (
        await request(server)
          .get(
            `/api/v1/catalogue/products?category=economy&location=TST1${locale ? `&locale=${locale}` : ''}`,
          )
          .expect(200)
      ).body as Array<{ code: string; name: string }>
    ).find((p) => p.code === code)!.name;

  it('serves a branch name in the requested language, English by default', async () => {
    expect((await location('TST1')).name).toBe('Test Location 1 (24/7)');
    expect((await location('TST1', 'en')).name).toBe('Test Location 1 (24/7)');
    expect((await location('TST1', 'fr')).name).toBe('Site de test 1 (24 h/24)');
    expect((await location('TST1', 'ar')).name).toBe('موقع الاختبار 1 (على مدار الساعة)');
  });

  it('falls back to the English text for a language with no translation', async () => {
    expect((await location('TST1', 'de')).name).toBe('Test Location 1 (24/7)');
  });

  it('serves an extra name in the requested language', async () => {
    expect(await productName('gps')).toBe('GPS navigation');
    expect(await productName('gps', 'fr')).toBe('Navigation GPS');
    expect(await productName('gps', 'ar')).toBe('نظام ملاحة GPS');
  });

  it('lists both areas on the Translations screen, fully translated', async () => {
    const res = await request(server)
      .get('/api/v1/config/translations/completeness')
      .set(auth())
      .expect(200);
    const rows = res.body.rows as Array<{
      namespace: string;
      locale: string;
      total: number;
      published: number;
    }>;
    for (const ns of ['catalogue:location', 'catalogue:product']) {
      for (const locale of ['fr', 'ar']) {
        const r = rows.find((x) => x.namespace === ns && x.locale === locale);
        expect(r, `${ns} / ${locale}`).toBeDefined();
        expect(r!.published).toBe(r!.total);
      }
    }
  });

  it('a new branch shows up to translate at once, and its translation is served once published', async () => {
    const code = `TRN${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    await request(server)
      .post('/api/v1/ops/locations')
      .set(auth())
      .send({
        code,
        name: 'Harbour Depot',
        timezone: 'America/New_York',
        status: 'active',
        pickupInstructions: 'Ask at the harbour kiosk.',
      })
      .expect(201);

    // English is served as typed, and it is now missing in French
    expect((await location(code, 'fr')).name).toBe('Harbour Depot');
    const gaps = await request(server)
      .get('/api/v1/config/translations?namespace=catalogue:location&locale=fr')
      .set(auth())
      .expect(200);
    const text = JSON.stringify(gaps.body);
    expect(text).toContain(code);

    // a draft is never served
    await request(server)
      .post('/api/v1/config/translations')
      .set(auth())
      .send({
        namespace: 'catalogue:location',
        key: code,
        localeCode: 'fr',
        value: 'Dépôt du port',
      })
      .expect(201);
    expect((await location(code, 'fr')).name).toBe('Harbour Depot');

    // published: served, and the instructions have their own key
    await request(server)
      .post('/api/v1/config/translations')
      .set(auth())
      .send({
        namespace: 'catalogue:location',
        key: code,
        localeCode: 'fr',
        value: 'Dépôt du port',
        status: 'published',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/translations')
      .set(auth())
      .send({
        namespace: 'catalogue:location',
        key: `${code}.pickup`,
        localeCode: 'fr',
        value: 'Demandez au kiosque du port.',
        status: 'published',
      })
      .expect(201);
    const fr = (
      (await request(server).get('/api/v1/config/locations?locale=fr').expect(200)).body as Array<{
        code: string;
        name: string;
        pickupInstructions: string | null;
      }>
    ).find((l) => l.code === code)!;
    expect(fr.name).toBe('Dépôt du port');
    expect(fr.pickupInstructions).toBe('Demandez au kiosque du port.');
    expect((await location(code)).name).toBe('Harbour Depot');

    // leave the shared test database as found: an archived branch is not a translation source
    await request(server).post(`/api/v1/ops/locations/${code}/archive?force=true`).set(auth());
  });
});
