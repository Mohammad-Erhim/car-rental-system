import { describe, expect, it } from 'vitest';

import {
  computeQuote,
  durationHoursBetween,
  isQuoteError,
  perDayRate,
  type RatePlanInput,
} from './quote.calculator';

const H = 3_600_000;
const base: RatePlanInput = {
  id: 'rp1',
  version: 1,
  currency: 'USD',
  baseDayMinor: 5000, // $50.00 / day
  hourMinor: 800, // $8.00 / hour
  minDurationHours: 24,
  maxDurationHours: null,
  fees: [
    { code: 'airport_fee', label: 'Airport concession fee', amountMinor: 1200, taxable: true },
  ],
  taxBps: 2000, // 20%
};
const at = (day: number, hour = 10) => Date.UTC(2026, 0, day, hour);

describe('durationHoursBetween', () => {
  it('rounds partial hours up', () => {
    expect(durationHoursBetween(at(10), at(10) + 90 * 60 * 1000)).toBe(2);
    expect(durationHoursBetween(at(10), at(13))).toBe(72);
  });
});

describe('perDayRate tiers', () => {
  const tiers = [
    { minHours: 168, dayMinor: 4000 }, // weekly
    { minHours: 720, dayMinor: 3000 }, // monthly
  ];
  it('uses base below the first tier', () => {
    expect(perDayRate(5000, tiers, 72)).toBe(5000);
  });
  it('uses the weekly tier at 7 days', () => {
    expect(perDayRate(5000, tiers, 168)).toBe(4000);
  });
  it('uses the monthly tier at 30 days', () => {
    expect(perDayRate(5000, tiers, 720)).toBe(3000);
  });
});

describe('computeQuote', () => {
  it('prices a clean 3-day rental with a fee and 20% tax; lines sum to total', () => {
    const r = computeQuote(at(10), at(13), base);
    if (isQuoteError(r)) throw new Error('unexpected error');
    // 3 * 5000 = 15000 ; + fee 1200 => subtotal 16200 ; tax 20% of (15000+1200)=3240 ; total 19440
    expect(r.fullDays).toBe(3);
    expect(r.remainderHours).toBe(0);
    expect(r.subtotalMinor).toBe(16200);
    expect(r.taxMinor).toBe(3240);
    expect(r.totalMinor).toBe(19440);
    expect(r.lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(r.totalMinor);
    expect(r.subtotalMinor + r.taxMinor).toBe(r.totalMinor);
  });

  it('bills a partial trailing day hourly but never above one day rate', () => {
    // 2 days + 20 hours. hourly 20*800=16000 > dayRate 5000 => capped at 5000.
    const r = computeQuote(at(10), at(12) + 20 * H, base);
    if (isQuoteError(r)) throw new Error('unexpected error');
    expect(r.fullDays).toBe(2);
    expect(r.remainderHours).toBe(20);
    const hoursLine = r.lines.find((l) => l.code === 'rental_hours');
    expect(hoursLine?.amountMinor).toBe(5000);
    expect(r.lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(r.totalMinor);
  });

  it('bills a small partial day at the true hourly amount', () => {
    // 1 day + 3 hours. hourly 3*800=2400 < dayRate 5000.
    const r = computeQuote(at(10), at(11) + 3 * H, base);
    if (isQuoteError(r)) throw new Error('unexpected error');
    expect(r.lines.find((l) => l.code === 'rental_hours')?.amountMinor).toBe(2400);
    expect(r.lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(r.totalMinor);
  });

  it('rejects a rental below the minimum duration', () => {
    const r = computeQuote(at(10), at(10) + 5 * H, base);
    expect(isQuoteError(r) && r.reason).toBe('below_min_duration');
  });

  it('rejects a rental above the maximum duration', () => {
    const r = computeQuote(at(10), at(40), { ...base, maxDurationHours: 240 });
    expect(isQuoteError(r) && r.reason).toBe('above_max_duration');
  });

  it('rejects an inverted window', () => {
    expect(isQuoteError(computeQuote(at(13), at(10), base))).toBe(true);
  });

  it('produces no tax line when taxBps is 0 and still balances', () => {
    const r = computeQuote(at(10), at(13), { ...base, taxBps: 0, fees: [] });
    if (isQuoteError(r)) throw new Error('unexpected error');
    expect(r.taxMinor).toBe(0);
    expect(r.lines.some((l) => l.kind === 'tax')).toBe(false);
    expect(r.totalMinor).toBe(15000);
    expect(r.lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(15000);
  });

  it('rounds tax half-up once (not per line)', () => {
    // subtotal 15000 taxable; taxBps 1234 => 15000*1234/10000 = 1851.0 -> 1851
    const r = computeQuote(at(10), at(13), { ...base, fees: [], taxBps: 1234 });
    if (isQuoteError(r)) throw new Error('unexpected error');
    expect(r.taxMinor).toBe(1851);
    expect(r.subtotalMinor + r.taxMinor).toBe(r.totalMinor);
  });
});
