import { describe, expect, it } from 'vitest';

import { isReady, readView, toApiParams, toScheduleParams, type ViewKey } from './report-params';

const blank = (over: Partial<Record<ViewKey, string>> = {}) =>
  ({
    report: '',
    preset: '',
    from: '',
    to: '',
    compare: '',
    basis: '',
    gran: '',
    cat: '',
    cur: '',
    ...over,
  }) as Record<ViewKey, string>;

describe('report view in the address', () => {
  it('starts on the overview for the last 30 days, compared with the period before', () => {
    const v = readView(blank());
    expect(v).toMatchObject({
      report: 'overview',
      preset: 'last_30_days',
      compare: 'previous',
      basis: 'booked',
      granularity: '',
      categories: [],
      currency: '',
    });
  });

  it('ignores anything it does not know rather than breaking', () => {
    const v = readView(
      blank({
        preset: 'forever',
        compare: 'x',
        basis: 'y',
        gran: 'hour',
        from: 'yesterday',
        cur: 'usd',
      }),
    );
    expect(v.preset).toBe('last_30_days');
    expect(v.compare).toBe('previous');
    expect(v.granularity).toBe('');
    expect(v.from).toBe('');
    expect(v.currency).toBe('');
  });

  it('a custom period is only ready with both days in order', () => {
    expect(isReady(readView(blank({ preset: 'custom' })))).toBe(false);
    expect(isReady(readView(blank({ preset: 'custom', from: '2026-03-01' })))).toBe(false);
    expect(
      isReady(readView(blank({ preset: 'custom', from: '2026-03-10', to: '2026-03-01' }))),
    ).toBe(false);
    expect(
      isReady(readView(blank({ preset: 'custom', from: '2026-03-01', to: '2026-03-10' }))),
    ).toBe(true);
    expect(isReady(readView(blank({ preset: 'last_7_days' })))).toBe(true);
  });

  it('asks the API only for what was chosen', () => {
    const v = readView(
      blank({
        preset: 'custom',
        from: '2026-03-01',
        to: '2026-03-10',
        cat: 'compact,suv',
        cur: 'EUR',
        gran: 'week',
      }),
    );
    expect(toApiParams(v, 'LHR')).toEqual({
      preset: 'custom',
      from: '2026-03-01',
      to: '2026-03-10',
      compare: 'previous',
      basis: 'booked',
      granularity: 'week',
      categoryCodes: ['compact', 'suv'],
      currency: 'EUR',
      locationCode: 'LHR',
    });
    expect(toApiParams(readView(blank({ preset: 'today' })))).toEqual({
      preset: 'today',
      compare: 'previous',
      basis: 'booked',
    });
  });

  it('a schedule is always relative: no dates, no one-off currency', () => {
    const v = readView(
      blank({ preset: 'custom', from: '2026-03-01', to: '2026-03-10', cur: 'EUR' }),
    );
    const s = toScheduleParams(v);
    expect(s).not.toHaveProperty('from');
    expect(s.preset).toBe('last_30_days');
    expect(toScheduleParams(readView(blank({ preset: 'last_month' }))).preset).toBe('last_month');
  });
});
