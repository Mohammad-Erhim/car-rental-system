import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { product } from '../src/database/schema/catalogue';
import { translation } from '../src/database/schema/i18n';
import { lookupValue } from '../src/database/schema/lookup';
import { location } from '../src/database/schema/org';
import {
  REFERENCE_TRANSLATIONS,
  seedReferenceTranslations,
} from '../src/database/seed/reference-i18n';

import { closeTestApp, getTestApp } from './helpers/app';

/**
 * Every reference-data value the seed creates must ship with French and Arabic labels, so a fresh
 * checkout shows the Translations screen at 100% for en, fr and ar. This fails the moment someone
 * adds a lookup value (or category / feature) without translating it.
 */
describe('reference-data translations', () => {
  let db: Database;
  beforeAll(async () => {
    db = (await getTestApp()).get<Database>(DB);
    await seedReferenceTranslations(db);
  });
  afterAll(closeTestApp);

  it('has a French and an Arabic label for every seeded lookup value', async () => {
    const values = await db
      .select({ type: lookupValue.typeCode, code: lookupValue.code })
      .from(lookupValue)
      .where(eq(lookupValue.isActive, true));
    expect(values.length).toBeGreaterThan(100);
    const missing = values
      .filter((v) => !REFERENCE_TRANSLATIONS[`lookup:${v.type}`]?.[v.code])
      .map((v) => `lookup:${v.type}/${v.code}`);
    expect(missing).toEqual([]);
  });

  it('has French and Arabic text for every seeded branch (name and instructions) and extra', async () => {
    const branches = await db
      .select({
        code: location.code,
        pickup: location.pickupInstructions,
        ret: location.returnInstructions,
      })
      .from(location)
      .where(eq(location.status, 'active'));
    const extras = await db
      .select({ code: product.code })
      .from(product)
      .where(eq(product.active, true));
    expect(branches.length).toBeGreaterThan(0);
    expect(extras.length).toBeGreaterThan(0);
    const missing = [
      ...branches.flatMap((b) => [
        b.code,
        ...(b.pickup ? [`${b.code}.pickup`] : []),
        ...(b.ret ? [`${b.code}.return`] : []),
      ]),
    ]
      .filter((k) => !REFERENCE_TRANSLATIONS['catalogue:location']?.[k])
      .map((k) => `catalogue:location/${k}`)
      .concat(
        extras
          .filter((e) => !REFERENCE_TRANSLATIONS['catalogue:product']?.[e.code])
          .map((e) => `catalogue:product/${e.code}`),
      );
    expect(missing).toEqual([]);
  });

  it('names every currency an operator can enable in French and Arabic', async () => {
    const rows = await db
      .select({ key: translation.key, locale: translation.localeCode })
      .from(translation)
      .where(
        and(
          eq(translation.namespace, 'lookup:currency'),
          inArray(translation.localeCode, ['fr', 'ar']),
        ),
      );
    const have = new Set(rows.map((r) => `${r.locale}:${r.key}`));
    const values = await db
      .select({ code: lookupValue.code })
      .from(lookupValue)
      .where(eq(lookupValue.typeCode, 'currency'));
    for (const v of values) {
      expect(have.has(`fr:${v.code}`), `fr ${v.code}`).toBe(true);
      expect(have.has(`ar:${v.code}`), `ar ${v.code}`).toBe(true);
    }
  });

  it('publishes them as rows, current against the English source', async () => {
    const rows = await db
      .select({
        ns: translation.namespace,
        locale: translation.localeCode,
        status: translation.status,
      })
      .from(translation)
      .where(
        and(
          inArray(translation.localeCode, ['fr', 'ar']),
          inArray(translation.namespace, ['lookup:cancel_reason', 'lookup:vehicle_state']),
        ),
      );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'published')).toBe(true);
    expect(new Set(rows.map((r) => r.locale))).toEqual(new Set(['fr', 'ar']));
  });

  it('never leaves an empty label', () => {
    for (const entries of Object.values(REFERENCE_TRANSLATIONS)) {
      for (const [fr, ar] of Object.values(entries)) {
        expect(fr.trim()).not.toBe('');
        expect(ar.trim()).not.toBe('');
      }
    }
  });

  it('is idempotent', async () => {
    expect(await seedReferenceTranslations(db)).toBe(0);
  });
});
