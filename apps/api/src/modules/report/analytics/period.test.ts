import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  bucketIndex,
  buckets,
  change,
  daysBetween,
  presetRange,
  previousPeriod,
  reportTimezone,
  resolvePeriod,
  todayIn,
} from './period';

const base = { compare: 'previous', basis: 'booked' } as const;
const NOW = new Date('2026-09-21T03:00:00Z');

describe('report time frame', () => {
  it('counts "today" in the report zone, not the server zone', () => {
    // 03:00 UTC is still the evening of the 20th in New York and already the 21st in Sydney
    expect(todayIn('America/New_York', NOW)).toBe('2026-09-20');
    expect(todayIn('Australia/Sydney', NOW)).toBe('2026-09-21');
  });

  it('resolves every preset to whole days ending today or at a period edge', () => {
    const today = '2026-09-21';
    expect(presetRange('last_7_days', today)).toEqual({ from: '2026-09-15', to: today });
    expect(presetRange('last_30_days', today)).toEqual({ from: '2026-08-23', to: today });
    expect(presetRange('this_month', today)).toEqual({ from: '2026-09-01', to: today });
    expect(presetRange('last_month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('this_quarter', today)).toEqual({ from: '2026-07-01', to: today });
    expect(presetRange('last_quarter', today)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(presetRange('this_year', today)).toEqual({ from: '2026-01-01', to: today });
    expect(presetRange('last_year', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-09-20', to: '2026-09-20' });
  });

  it('handles month ends and leap days', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-02-29', -12)).toBe('2023-02-28');
    expect(presetRange('last_month', '2026-03-10')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(presetRange('last_month', '2026-01-10')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(daysBetween('2024-02-01', '2024-02-29')).toBe(29);
  });

  it('compares with the same number of days just before, or the same dates a year earlier', () => {
    const p = resolvePeriod({ ...base, preset: 'last_7_days' }, 'UTC', NOW);
    expect(p.compare).toEqual({ kind: 'previous', from: '2026-09-08', to: '2026-09-14' });
    expect(daysBetween(p.compare!.from, p.compare!.to)).toBe(p.days);
    const y = resolvePeriod({ ...base, compare: 'year', preset: 'last_month' }, 'UTC', NOW);
    expect(y.compare).toEqual({ kind: 'year', from: '2025-08-01', to: '2025-08-31' });
    expect(
      resolvePeriod({ ...base, compare: 'none', preset: 'today' }, 'UTC', NOW).compare,
    ).toBeNull();
  });

  it('sets a running month against the same days of the month before, a whole one against a whole one', () => {
    const at = (
      preset:
        | 'this_month'
        | 'last_month'
        | 'this_quarter'
        | 'last_quarter'
        | 'this_year'
        | 'last_year',
    ) => resolvePeriod({ ...base, preset }, 'UTC', NOW).compare!;
    // 21 Sep so far → 1–21 Aug (the same 21 days), not the 21 days before 1 Sep
    expect(at('this_month')).toMatchObject({ from: '2026-08-01', to: '2026-08-21' });
    expect(at('last_month')).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
    expect(at('this_quarter')).toMatchObject({ from: '2026-04-01', to: '2026-06-22' });
    expect(at('last_quarter')).toMatchObject({ from: '2026-01-01', to: '2026-03-31' });
    expect(at('this_year')).toMatchObject({ from: '2025-01-01', to: '2025-09-21' });
    expect(at('last_year')).toMatchObject({ from: '2024-01-01', to: '2024-12-31' });
    // a short month never spills into the next one
    const t = (today: string) => previousPeriod('this_month', presetRange('this_month', today), 31);
    expect(t('2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('accepts custom dates and refuses ones that make no sense', () => {
    const ok = resolvePeriod(
      { ...base, preset: 'custom', from: '2026-01-01', to: '2026-01-31' },
      'UTC',
      NOW,
    );
    expect(ok.days).toBe(31);
    const bad = (over: object) => () =>
      resolvePeriod({ ...base, preset: 'custom', ...over }, 'UTC', NOW);
    expect(bad({})).toThrow();
    expect(bad({ from: '2026-02-01', to: '2026-01-01' })).toThrow();
    expect(bad({ from: '2026-02-30', to: '2026-03-01' })).toThrow();
    expect(bad({ from: '2020-01-01', to: '2026-01-01' })).toThrow();
  });

  it('picks a readable grouping and never draws hundreds of daily bars', () => {
    const g = (days: number, want?: 'day' | 'week' | 'month') =>
      resolvePeriod(
        {
          ...base,
          preset: 'custom',
          from: '2025-01-01',
          to: addDays('2025-01-01', days - 1),
          granularity: want,
        },
        'UTC',
        NOW,
      ).granularity;
    expect(g(7)).toBe('day');
    expect(g(60)).toBe('week');
    expect(g(365)).toBe('month');
    expect(g(200, 'day')).toBe('week');
    expect(g(60, 'day')).toBe('day');
    expect(g(60, 'month')).toBe('month');
  });

  it('cuts contiguous buckets that cover the period exactly once', () => {
    for (const granularity of ['day', 'week', 'month'] as const) {
      const list = buckets('2026-01-28', '2026-04-03', granularity);
      expect(list[0]!.start).toBe('2026-01-28');
      expect(list.at(-1)!.end).toBe('2026-04-03');
      for (let i = 1; i < list.length; i++)
        expect(list[i]!.start).toBe(addDays(list[i - 1]!.end, 1));
      expect(list.reduce((n, b) => n + daysBetween(b.start, b.end), 0)).toBe(
        daysBetween('2026-01-28', '2026-04-03'),
      );
    }
    const weeks = buckets('2026-09-16', '2026-09-30', 'week');
    expect(weeks[0]).toEqual({ start: '2026-09-16', end: '2026-09-20' }); // Wed–Sun, clipped
    expect(weeks[1]).toEqual({ start: '2026-09-21', end: '2026-09-27' }); // Mon–Sun
    const months = buckets('2026-01-15', '2026-03-10', 'month');
    expect(months.map((b) => b.end)).toEqual(['2026-01-31', '2026-02-28', '2026-03-10']);
  });

  it('finds the bucket a day belongs to', () => {
    const list = buckets('2026-09-01', '2026-09-30', 'week');
    expect(bucketIndex('2026-09-01', list)).toBe(0);
    expect(bucketIndex('2026-09-06', list)).toBe(0); // Tue 1st – Sun 6th
    expect(bucketIndex('2026-09-07', list)).toBe(1); // Monday starts the next week
    expect(bucketIndex('2026-09-30', list)).toBe(list.length - 1);
    expect(bucketIndex('2026-10-01', list)).toBe(-1);
  });

  it('says nothing about change when there is nothing to compare with', () => {
    expect(change(120, 100)).toBeCloseTo(0.2);
    expect(change(80, 100)).toBeCloseTo(-0.2);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
    expect(change(3, null)).toBeNull();
  });

  it('chooses one zone for a report, the same one every time', () => {
    expect(reportTimezone([])).toBe('UTC');
    expect(reportTimezone(['Europe/London'])).toBe('Europe/London');
    expect(reportTimezone(['Europe/London', 'America/New_York', 'America/New_York'])).toBe(
      'America/New_York',
    );
    expect(reportTimezone(['Europe/London', 'America/New_York'])).toBe('America/New_York'); // tie → alphabetical
  });
});
