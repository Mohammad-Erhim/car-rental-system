import { describe, expect, it } from 'vitest';

import { addBusinessHours, type Schedule } from './business-hours';

// Mon–Fri 09:00–17:00, closed weekends, New York time (UTC−4 in summer, −5 in winter)
const office: Schedule = {
  timezone: 'America/New_York',
  regularHours: [
    { day: 0, closed: true },
    ...[1, 2, 3, 4, 5].map((day) => ({ day, open: '09:00', close: '17:00' })),
    { day: 6, closed: true },
  ],
  exceptions: [],
};
// helper: a wall-clock time in New York in summer (EDT = UTC−4)
const ny = (iso: string) => new Date(`${iso}-04:00`);
const show = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'America/New_York' });

describe('addBusinessHours', () => {
  it('counts only opening hours: 4h from Monday 15:00 ends Tuesday 11:00', () => {
    expect(show(addBusinessHours(ny('2026-06-08T15:00:00'), 4, office))).toBe(
      '2026-06-09 11:00:00',
    );
  });

  it('a request made when closed starts counting at the next opening', () => {
    // Saturday 10:00 + 2h → Monday 11:00
    expect(show(addBusinessHours(ny('2026-06-06T10:00:00'), 2, office))).toBe(
      '2026-06-08 11:00:00',
    );
    // Monday 07:00 (before opening) + 1h → Monday 10:00
    expect(show(addBusinessHours(ny('2026-06-08T07:00:00'), 1, office))).toBe(
      '2026-06-08 10:00:00',
    );
  });

  it('a long deadline skips whole weekends: 24h from Friday 12:00 ends Wednesday 12:00', () => {
    // Fri 12–17 = 5h, Mon 8h, Tue 8h → 21h, then 3h on Wed → 12:00
    expect(show(addBusinessHours(ny('2026-06-05T12:00:00'), 24, office))).toBe(
      '2026-06-10 12:00:00',
    );
  });

  it('ending exactly at closing time stays on that day', () => {
    expect(show(addBusinessHours(ny('2026-06-08T13:00:00'), 4, office))).toBe(
      '2026-06-08 17:00:00',
    );
  });

  it('honours a closed day and a half day', () => {
    const s: Schedule = {
      ...office,
      exceptions: [
        { date: '2026-06-09', closed: true }, // Tuesday closed
        { date: '2026-06-10', closed: false, open: '09:00', close: '12:00' }, // Wednesday half day
      ],
    };
    // Mon 15:00 + 4h: 2h Monday, Tuesday closed, 2h Wednesday morning → Wed 11:00
    expect(show(addBusinessHours(ny('2026-06-08T15:00:00'), 4, s))).toBe('2026-06-10 11:00:00');
    // Wed half day only offers 3h: 5h from Wed 09:00 → 3h Wed, 2h Thu → Thu 11:00
    expect(show(addBusinessHours(ny('2026-06-10T09:00:00'), 5, s))).toBe('2026-06-11 11:00:00');
  });

  it('is correct across the spring-forward daylight-saving change', () => {
    // 2026-03-08 is the US spring-forward Sunday. Fri 03-06 16:00 EST + 2h → Mon 03-09 10:00 EDT
    const from = new Date('2026-03-06T16:00:00-05:00');
    expect(show(addBusinessHours(from, 2, office))).toBe('2026-03-09 10:00:00');
  });

  it('with no schedule (or no hours), it is plain elapsed time', () => {
    const from = new Date('2026-06-06T10:00:00Z');
    expect(addBusinessHours(from, 5, null).toISOString()).toBe('2026-06-06T15:00:00.000Z');
    expect(
      addBusinessHours(from, 5, {
        timezone: 'UTC',
        regularHours: [],
        exceptions: [],
      }).toISOString(),
    ).toBe('2026-06-06T15:00:00.000Z');
  });

  it('a location that is never open falls back to elapsed time instead of looping', () => {
    const closed: Schedule = {
      timezone: 'UTC',
      regularHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: true })),
      exceptions: [],
    };
    const from = new Date('2026-06-06T10:00:00Z');
    expect(addBusinessHours(from, 3, closed).toISOString()).toBe('2026-06-06T13:00:00.000Z');
  });

  it('zero hours is now (or the next opening if closed)', () => {
    expect(show(addBusinessHours(ny('2026-06-08T10:00:00'), 0, office))).toBe(
      '2026-06-08 10:00:00',
    );
  });
});
