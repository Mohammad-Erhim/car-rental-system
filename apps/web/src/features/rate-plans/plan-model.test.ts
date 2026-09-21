import { describe, expect, it } from 'vitest';

import {
  cloneValues,
  emptyPlanValues,
  planToValues,
  unpricedCategories,
  valuesToInput,
  wouldReplace,
} from './plan-model';

import type { RatePlan } from '@/lib/ops-discovery-hooks';

const plan = (over: Partial<RatePlan> = {}): RatePlan => ({
  id: 'p1',
  categoryCode: 'economy',
  locationCode: null,
  currency: 'USD',
  name: 'Standard',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  baseDayMinor: 4100,
  hourMinor: 500,
  minDurationHours: 24,
  maxDurationHours: null,
  taxBps: 2000,
  fees: [{ code: 'reg', label: 'Registration', amountMinor: 495, taxable: false }],
  tiers: [{ minHours: 72, dayMinor: 3800 }],
  status: 'published',
  publishedVersion: 1,
  version: 3,
  ...over,
});

describe('plan values <-> API input', () => {
  it('round-trips money without losing cents', () => {
    const input = valuesToInput(planToValues(plan()), 'p1');
    expect(input).toMatchObject({
      id: 'p1',
      baseDayMinor: 4100,
      hourMinor: 500,
      taxBps: 2000,
      maxDurationHours: null,
      locationCode: null,
      fees: [{ code: 'reg', amountMinor: 495, taxable: false }],
      tiers: [{ minHours: 72, dayMinor: 3800 }],
    });
  });

  it('a blank extra hour and blank max duration mean "none"', () => {
    const v = {
      ...emptyPlanValues(),
      categoryCode: 'suv',
      name: 'x',
      baseDay: '10',
      hour: '',
      maxDuration: '',
    };
    const input = valuesToInput(v);
    expect(input.hourMinor).toBe(0);
    expect(input.maxDurationHours).toBeNull();
  });

  it('cloning restarts the plan today with no end date', () => {
    const v = cloneValues(plan({ effectiveFrom: '2020-01-01', effectiveTo: '2020-12-31' }));
    expect(v.effectiveTo).toBe('');
    expect(v.effectiveFrom).not.toBe('2020-01-01');
    expect(v.name).toBe('Standard');
  });
});

describe('wouldReplace', () => {
  const all = [
    plan({ id: 'a' }),
    plan({ id: 'b', locationCode: 'JFK' }),
    plan({ id: 'c', categoryCode: 'suv' }),
  ];

  it('finds overlapping published plans of the same category and scope only', () => {
    const draft = plan({ id: 'd', status: 'draft', effectiveFrom: '2026-06-01' });
    expect(wouldReplace(draft, all).map((p) => p.id)).toEqual(['a']);
  });

  it('never replaces a price list in another currency', () => {
    const eur = plan({ id: 'eur', currency: 'EUR' });
    const draft = plan({ id: 'd', status: 'draft', effectiveFrom: '2026-06-01' });
    expect(wouldReplace(draft, [eur])).toEqual([]);
    expect(wouldReplace({ ...draft, currency: 'EUR' }, [eur]).map((p) => p.id)).toEqual(['eur']);
  });

  it('ignores plans whose window does not overlap', () => {
    const past = plan({ id: 'old', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' });
    const draft = plan({ id: 'd', status: 'draft', effectiveFrom: '2026-06-01' });
    expect(wouldReplace(draft, [past])).toEqual([]);
  });
});

describe('unpricedCategories', () => {
  const cats = [
    { code: 'economy', displayName: 'Economy' },
    { code: 'suv', displayName: 'SUV' },
  ];
  it('flags categories with no currently-effective published plan', () => {
    const plans = [plan(), plan({ id: 'x', categoryCode: 'suv', status: 'draft' })];
    expect(unpricedCategories(cats, plans, '2026-09-18').map((c) => c.code)).toEqual(['suv']);
  });

  it('a plan that has not started, or has ended, does not cover the category', () => {
    const plans = [plan({ effectiveFrom: '2027-01-01' })];
    expect(unpricedCategories(cats, plans, '2026-09-18').map((c) => c.code)).toEqual([
      'economy',
      'suv',
    ]);
    const ended = [plan({ effectiveTo: '2026-01-31' })];
    expect(unpricedCategories(cats, ended, '2026-09-18').map((c) => c.code)).toContain('economy');
  });
});
