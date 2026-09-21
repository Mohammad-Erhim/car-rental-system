import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * DEC-036 — operator-managed currencies and what follows from them: which currencies can exist,
 * the default that cannot be removed, price lists per currency that coexist, the customer picking
 * one, the booking locking it, and disabling one without stranding what already exists.
 *
 * Everything below is scoped to TST2 / compact, in a window ~2 years out, so the plans it
 * publishes never price anyone else's booking in the rest of the suite.
 */
const ymdIn = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const WINDOW_FROM = ymdIn(690);
const WINDOW_TO = ymdIn(710);
const PICKUP = isoIn(700);
const RETURN = isoIn(703);

const DRIVERS = [
  {
    role: 'primary_renter' as const,
    fullName: 'Dana Driver',
    email: 'dana@example.test',
    licenceNumber: 'D-99887766',
    licenceCountry: 'US',
  },
];

interface Overview {
  defaultCode: string;
  currencies: Array<{
    code: string;
    label: string;
    digits: number;
    isDefault: boolean;
    isActive: boolean;
    usage: { ratePlans: number; products: number };
  }>;
  available: Array<{ code: string; name: string; digits: number }>;
}

describe('currencies (DEC-036)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let customer: string;
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  const overview = async () =>
    (await request(server).get('/api/v1/ops/config/currencies').set(auth()).expect(200))
      .body as Overview;

  const plan = async (currency: string, baseDayMinor: number) => {
    const created = (
      await request(server)
        .post('/api/v1/ops/pricing/rate-plans')
        .set(auth())
        .send({
          categoryCode: 'compact',
          locationCode: 'TST2',
          currency,
          name: `ccy ${currency} ${Date.now()}`,
          effectiveFrom: WINDOW_FROM,
          effectiveTo: WINDOW_TO,
          baseDayMinor,
          minDurationHours: 24,
          taxBps: 0,
        })
        .expect(201)
    ).body[0];
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${created.id}/publish`)
      .set(auth())
      .expect(201);
    return created.id as string;
  };

  const search = (currency?: string) =>
    request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST2',
        pickupAt: PICKUP,
        returnAt: RETURN,
        categoryCode: 'compact',
        ...(currency ? { currency } : {}),
      })
      .expect(201)
      .then((r) => r.body.options[0] as { currency: string; fromTotalMinor: number });

  // hold:false by default — pricing never depends on inventory, and a pile of held quotes would
  // exhaust the couple of compact cars at TST2 for the one booking below that needs a real hold
  const quote = (currency?: string, hold = false) =>
    request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST2',
        pickupAt: PICKUP,
        returnAt: RETURN,
        categoryCode: 'compact',
        hold,
        holderKey: `ccy-${Math.random().toString(36).slice(2)}`,
        ...(currency ? { currency } : {}),
      })
      .expect(201)
      .then((r) => r.body as { reference: string; currency: string; totalMinor: number });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    customer = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  // ---------------------------------------------------------------- what can exist

  it('lists the enabled currencies with one default, and offers the rest of the catalogue', async () => {
    const o = await overview();
    expect(o.defaultCode).toBe('USD');
    const usd = o.currencies.find((c) => c.code === 'USD')!;
    expect(usd).toMatchObject({ isDefault: true, isActive: true, digits: 2 });
    expect(o.currencies.filter((c) => c.isDefault)).toHaveLength(1);
    // not yet enabled → offered; already enabled → not offered twice
    expect(o.available.map((c) => c.code)).toContain('JPY');
    expect(o.available.map((c) => c.code)).not.toContain('USD');
  });

  it('only a catalogue currency can be enabled — no free text, no 3-decimal currencies', async () => {
    for (const code of ['XYZ', 'KWD', 'BHD', 'usdd', '12']) {
      await request(server)
        .post('/api/v1/ops/config/currencies')
        .set(auth())
        .send({ code })
        .expect((r) => expect([400, 422]).toContain(r.status));
    }
    // the generic reference-data door is guarded the same way
    await request(server)
      .post('/api/v1/reference-data/types/currency/values')
      .set(auth())
      .send({ code: 'XYZ', label: 'Nonsense' })
      .expect(422);
    expect((await overview()).currencies.map((c) => c.code)).not.toContain('XYZ');
  });

  it('enabling a currency names it in every enabled language and is idempotent', async () => {
    const first = await request(server)
      .post('/api/v1/ops/config/currencies')
      .set(auth())
      .send({ code: 'jpy' })
      .expect(201);
    const jpy = (first.body as Overview).currencies.find((c) => c.code === 'JPY')!;
    expect(jpy).toMatchObject({ isActive: true, digits: 0, isDefault: false });

    await request(server)
      .post('/api/v1/ops/config/currencies')
      .set(auth())
      .send({ code: 'JPY' })
      .expect(201);
    const after = await overview();
    expect(after.currencies.filter((c) => c.code === 'JPY')).toHaveLength(1);
    expect(after.available.map((c) => c.code)).not.toContain('JPY');

    // a localised name with no translation file to maintain
    const fr = await request(server)
      .get('/api/v1/reference-data/types/currency/values?locale=fr')
      .expect(200);
    const label = (fr.body.values as Array<{ code: string; label: string }>).find(
      (v) => v.code === 'JPY',
    )?.label;
    expect(label).toBeTruthy();
    expect(label).not.toBe('Japanese Yen');
  });

  it('the default currency cannot be disabled, and a disabled one cannot become default', async () => {
    await request(server)
      .post('/api/v1/ops/config/currencies/USD/disable')
      .set(auth())
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('default_currency_required'));
    await request(server)
      .post('/api/v1/ops/config/currencies/USD/disable?force=true')
      .set(auth())
      .expect(422);

    await request(server)
      .post('/api/v1/ops/config/currencies')
      .set(auth())
      .send({ code: 'CHF' })
      .expect(201);
    await request(server).post('/api/v1/ops/config/currencies/CHF/disable').set(auth()).expect(201);
    await request(server)
      .post('/api/v1/ops/config/currencies/CHF/default')
      .set(auth())
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('currency_not_enabled'));
  });

  it('is admin-only: a customer cannot manage currencies', async () => {
    await request(server)
      .post('/api/v1/ops/config/currencies')
      .set('Authorization', `Bearer ${customer}`)
      .send({ code: 'SEK' })
      .expect(403);
    await request(server).get('/api/v1/ops/config/currencies').expect(401);
  });

  // ------------------------------------------------------- price lists per currency

  describe('price lists in more than one currency', () => {
    let usdPlan: string;
    let eurPlan: string;

    beforeAll(async () => {
      usdPlan = await plan('USD', 4000);
      eurPlan = await plan('EUR', 3500);
    });

    it('publishing a EUR list does not retire the USD list for the same category and place', async () => {
      const plans = (
        await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200)
      ).body as Array<{ id: string; status: string; currency: string }>;
      expect(plans.find((p) => p.id === usdPlan)).toMatchObject({
        status: 'published',
        currency: 'USD',
      });
      expect(plans.find((p) => p.id === eurPlan)).toMatchObject({
        status: 'published',
        currency: 'EUR',
      });
    });

    it('a second list in the SAME currency still supersedes the first', async () => {
      const older = await plan('GBP', 3000);
      const newer = await plan('GBP', 3100);
      const plans = (
        await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200)
      ).body as Array<{ id: string; status: string }>;
      expect(plans.find((p) => p.id === older)?.status).toBe('retired');
      expect(plans.find((p) => p.id === newer)?.status).toBe('published');
    });

    it('with no currency asked, prices come in the default currency — never an arbitrary one', async () => {
      const o = await search();
      expect(o.currency).toBe('USD');
      const q = await quote();
      expect(q.currency).toBe('USD');
    });

    it('a customer who picks EUR is priced in EUR, on the search and on the quote', async () => {
      const o = await search('EUR');
      expect(o.currency).toBe('EUR');
      const usd = await search('USD');
      expect(o.fromTotalMinor).not.toBe(usd.fromTotalMinor);

      const q = await quote('eur');
      expect(q.currency).toBe('EUR');
      const again = await request(server)
        .get(`/api/v1/discovery/quotes/${q.reference}`)
        .expect(200);
      expect(again.body.currency).toBe('EUR');
    });

    it('falls back to the default when there is no list in the chosen currency', async () => {
      // JPY is enabled but has no price list for this category and place
      expect((await search('JPY')).currency).toBe('USD');
      expect((await quote('JPY')).currency).toBe('USD');
    });

    it('rejects a malformed currency instead of guessing', async () => {
      await request(server)
        .post('/api/v1/discovery/search')
        .send({ pickupLocationCode: 'TST2', pickupAt: PICKUP, returnAt: RETURN, currency: 'EURO' })
        .expect(422);
    });

    it('offers customers only currencies that can actually be bought (plus the default)', async () => {
      const res = await request(server).get('/api/v1/discovery/currencies').expect(200);
      const codes = (res.body.currencies as Array<{ code: string }>).map((c) => c.code);
      expect(res.body.defaultCode).toBe('USD');
      expect(codes[0]).toBe('USD');
      expect(codes).toContain('EUR');
      expect(codes).not.toContain('JPY'); // enabled, but nothing priced in it
      const eur = (res.body.currencies as Array<{ code: string; digits: number }>).find(
        (c) => c.code === 'EUR',
      )!;
      expect(eur.digits).toBe(2);
    });

    it('a booking made in EUR is a EUR reservation, paid in EUR, and stays EUR', async () => {
      const q = await quote('EUR', true);
      const res = await request(server)
        .post('/api/v1/bookings/confirm')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          quoteReference: q.reference,
          drivers: DRIVERS,
          acceptTerms: true,
          paymentToken: 'tok_visa_ok',
        })
        .expect(201);
      expect(res.body.currency).toBe('EUR');
      expect(res.body.totalMinor).toBe(q.totalMinor);
      expect(res.body.paidMinor).toBe(q.totalMinor);

      const mine = await request(server)
        .get(`/api/v1/bookings/${res.body.reference}`)
        .set('Authorization', `Bearer ${customer}`)
        .expect(200);
      expect(mine.body.currency).toBe('EUR');

      // changing the dates re-prices in the reservation's OWN currency — the EUR list (35.00/day),
      // never whichever list happens to win today (the USD one is 40.00/day)
      const m = await request(server)
        .post(`/api/v1/reservations/${res.body.reference}/modify`)
        .set('Authorization', `Bearer ${customer}`)
        .send({ returnAt: isoIn(705), paymentToken: 'tok_ok', reasonCode: 'late_return' })
        .expect(201);
      expect(m.body.currency).toBe('EUR');
      expect(m.body.deltaMinor).toBe(2 * 3500);
    });

    it('extras are offered only in the currency of the quote', async () => {
      const code = `xtra_${Date.now().toString(36)}`;
      for (const currency of ['USD', 'EUR']) {
        await request(server)
          .post('/api/v1/ops/catalogue/products')
          .set(auth())
          .send({
            code: `${code}_${currency.toLowerCase()}`,
            name: `Extra ${currency}`,
            kind: 'extra',
            unitPriceMinor: 500,
            currency,
            pricingUnit: 'per_rental',
            maxQuantity: 1,
            categoryScope: ['compact'],
            locationScope: ['TST2'],
          })
          .expect(201);
      }
      const list = async (currency?: string) =>
        (
          (
            await request(server)
              .get(
                `/api/v1/catalogue/products?category=compact&location=TST2${currency ? `&currency=${currency}` : ''}`,
              )
              .expect(200)
          ).body as Array<{ code: string; currency: string }>
        ).filter((p) => p.code.startsWith(code));

      expect((await list('EUR')).map((p) => p.currency)).toEqual(['EUR']);
      expect((await list('usd')).map((p) => p.currency)).toEqual(['USD']);
      expect(await list()).toHaveLength(2);
    });

    // ------------------------------------------------ disabling without stranding anything

    it('disabling a currency in use asks for confirmation, then stops new prices in it', async () => {
      const before = (await overview()).currencies.find((c) => c.code === 'EUR')!;
      expect(before.usage.ratePlans).toBeGreaterThan(0);

      await request(server)
        .post('/api/v1/ops/config/currencies/EUR/disable')
        .set(auth())
        .expect(422)
        .expect((r) => expect(r.body.params?.reason).toBe('lookup_value_in_use'));

      await request(server)
        .post('/api/v1/ops/config/currencies/EUR/disable?force=true')
        .set(auth())
        .expect(201);

      // a customer asking for EUR is now priced in the default currency instead
      expect((await search('EUR')).currency).toBe('USD');
      expect((await quote('EUR')).currency).toBe('USD');
      const res = await request(server).get('/api/v1/discovery/currencies').expect(200);
      expect((res.body.currencies as Array<{ code: string }>).map((c) => c.code)).not.toContain(
        'EUR',
      );
    });

    it('a reservation already made in the disabled currency is untouched', async () => {
      const mine = await request(server)
        .get('/api/v1/bookings/mine')
        .set('Authorization', `Bearer ${customer}`)
        .expect(200);
      const eur = (mine.body as Array<{ currency: string }>).filter((r) => r.currency === 'EUR');
      expect(eur.length).toBeGreaterThan(0);
    });

    it('a new price list cannot be written in a disabled currency; re-enabling brings it back', async () => {
      await request(server)
        .post('/api/v1/ops/pricing/rate-plans')
        .set(auth())
        .send({
          categoryCode: 'compact',
          locationCode: 'TST2',
          currency: 'EUR',
          name: `ccy off ${Date.now()}`,
          effectiveFrom: ymdIn(800),
          baseDayMinor: 3000,
        })
        .expect(422)
        .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('currency'));

      // the existing EUR list was never touched, so re-enabling makes it sellable again at once
      await request(server)
        .post('/api/v1/ops/config/currencies')
        .set(auth())
        .send({ code: 'EUR' })
        .expect(201);
      expect((await search('EUR')).currency).toBe('EUR');
    });
  });

  // ---------------------------------------------------------------- the default itself

  it('changing the default moves the one default flag and keeps the organisation in step', async () => {
    const res = await request(server)
      .post('/api/v1/ops/config/currencies/EUR/default')
      .set(auth())
      .expect(201);
    const o = res.body as Overview;
    expect(o.defaultCode).toBe('EUR');
    expect(o.currencies.filter((c) => c.isDefault).map((c) => c.code)).toEqual(['EUR']);

    // with EUR the default, "no currency asked" now means EUR
    expect((await search()).currency).toBe('EUR');

    // put it back — the rest of the suite assumes a USD default
    await request(server).post('/api/v1/ops/config/currencies/USD/default').set(auth()).expect(201);
    expect((await overview()).defaultCode).toBe('USD');
    expect((await search()).currency).toBe('USD');
  });
});
