import { describe, expect, it } from 'vitest';

import { checkWithinHours, localParts, type WeeklyHours } from './operating-hours';

const weekly = (open: string, close: string, closedDays: number[] = []): WeeklyHours[] =>
  Array.from({ length: 7 }, (_, day) =>
    closedDays.includes(day) ? { day, closed: true } : { day, open, close },
  );

describe('localParts', () => {
  it('resolves an instant to the location wall clock', () => {
    // 2026-01-12 is a Monday. 14:00 UTC = 09:00 America/New_York (EST, UTC-5).
    const p = localParts(Date.UTC(2026, 0, 12, 14, 0), 'America/New_York');
    expect(p.date).toBe('2026-01-12');
    expect(p.weekday).toBe(1); // Monday
    expect(p.minutes).toBe(9 * 60);
  });

  it('rolls the date backwards across the UTC day boundary', () => {
    // 2026-01-12 02:00 UTC = 2026-01-11 21:00 New York
    const p = localParts(Date.UTC(2026, 0, 12, 2, 0), 'America/New_York');
    expect(p.date).toBe('2026-01-11');
    expect(p.minutes).toBe(21 * 60);
  });
});

describe('checkWithinHours', () => {
  const hours = weekly('06:00', '22:00', [0]); // closed Sundays

  it('allows an instant inside the window', () => {
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 10 * 60 }, hours, []).ok,
    ).toBe(true);
  });

  it('rejects before open and after close', () => {
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 5 * 60 }, hours, []).reason,
    ).toBe('before_open');
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 23 * 60 }, hours, []).reason,
    ).toBe('after_close');
  });

  it('permits after close when after-hours return is allowed', () => {
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 23 * 60 }, hours, [], {
        allowAfterClose: true,
      }).ok,
    ).toBe(true);
  });

  it('rejects a closed weekday', () => {
    expect(
      checkWithinHours({ date: '2026-01-11', weekday: 0, minutes: 10 * 60 }, hours, []).reason,
    ).toBe('closed_that_day');
  });

  it('honours a date-specific closure exception over the weekly schedule', () => {
    const exc = [{ date: '2026-01-12', closed: true }];
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 10 * 60 }, hours, exc).reason,
    ).toBe('closed_that_day');
  });

  it('honours a date-specific reduced-hours exception', () => {
    const exc = [{ date: '2026-01-12', closed: false, open: '09:00', close: '13:00' }];
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 8 * 60 }, hours, exc).reason,
    ).toBe('before_open');
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 12 * 60 }, hours, exc).ok,
    ).toBe(true);
  });

  it('treats an open day with no explicit window as open all day', () => {
    const allDay: WeeklyHours[] = [{ day: 1 }];
    expect(
      checkWithinHours({ date: '2026-01-12', weekday: 1, minutes: 3 * 60 }, allDay, []).ok,
    ).toBe(true);
  });
});
