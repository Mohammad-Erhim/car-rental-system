import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { translation } from '../src/database/schema/i18n';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';

/**
 * The public translation bundle carries the app's own strings for each language on top of which the
 * database's published overrides win — so a build that adds strings is translated the moment it
 * runs, before anyone re-seeds (a dashboard that shows "Title / Subtitle" for a page whose strings
 * were never seeded is the failure this prevents).
 */
describe('GET /meta/translations', () => {
  let server: ReturnType<typeof httpServer>;
  let db: Database;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
  });
  afterAll(closeTestApp);

  const bundle = async (locale: string, namespace = 'common') =>
    (
      await request(server)
        .get(`/api/v1/meta/translations?namespace=${namespace}&locale=${locale}`)
        .expect(200)
    ).body as Record<string, string>;

  it('still has the bundled text for a string the database has never seen', async () => {
    const before = await bundle('fr');
    expect(before['ops.ccy.title']).toBe('Devises');

    // as on a database seeded by an older build: the row simply is not there
    await db
      .delete(translation)
      .where(
        and(
          eq(translation.namespace, 'common'),
          eq(translation.key, 'ops.ccy.title'),
          eq(translation.localeCode, 'fr'),
        ),
      );
    const after = await bundle('fr');
    expect(after['ops.ccy.title']).toBe('Devises');
    expect((await bundle('ar'))['ops.ccy.title']).toBe('العملات');
  });

  it('a published override still wins over the bundled text', async () => {
    await db
      .insert(translation)
      .values({
        namespace: 'common',
        key: 'ops.ccy.title',
        localeCode: 'fr',
        value: 'Monnaies',
        publishedValue: 'Monnaies',
        status: 'published',
      })
      .onConflictDoUpdate({
        target: [translation.namespace, translation.key, translation.localeCode],
        set: { value: 'Monnaies', publishedValue: 'Monnaies', status: 'published' },
      });
    expect((await bundle('fr'))['ops.ccy.title']).toBe('Monnaies');
    expect((await bundle('en'))['ops.ccy.title']).toBe('Currencies');
  });

  it('an unknown language gets nothing (the client falls back to English)', async () => {
    expect(await bundle('xx')).toEqual({});
  });
});
