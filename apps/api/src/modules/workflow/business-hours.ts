/**
 * Deadlines counted in business hours: "24 hours" means 24 hours the location is open, not 24 on the
 * clock. Pure functions over a location's weekly hours, its one-off exceptions and its time zone, so
 * the maths (weekends, closures, half days, daylight saving) is testable without a database.
 */
export interface DayHours {
  /** 0 = Sunday … 6 = Saturday, in the location's own time */
  day: number;
  open?: string | null;
  close?: string | null;
  closed?: boolean;
}
export interface HoursException {
  /** YYYY-MM-DD in the location's own time */
  date: string;
  closed: boolean;
  open?: string | null;
  close?: string | null;
}
export interface Schedule {
  timezone: string;
  regularHours: DayHours[];
  exceptions: HoursException[];
}

const MIN = 60_000;
const MAX_DAYS = 400; // a deadline is never counted further out than this (a schedule that is always closed)

interface Local {
  y: number;
  m: number;
  d: number;
  minutes: number; // minutes since local midnight
  weekday: number;
}

function localParts(at: Date, timeZone: string): Local {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(p.weekday));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday,
  };
}

/** The UTC instant at which the wall clock in `timeZone` reads y-m-d h:mm (DST-safe). */
function zoned(y: number, m: number, d: number, minutes: number, timeZone: string): Date {
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let utc = wall;
  for (let i = 0; i < 3; i++) {
    const l = localParts(new Date(utc), timeZone);
    const shown = Date.UTC(l.y, l.m - 1, l.d, 0, l.minutes);
    const diff = shown - wall;
    if (diff === 0) break;
    utc -= diff;
  }
  return new Date(utc);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Opening interval (in minutes since local midnight) for a given local date, or null when closed. */
function openInterval(
  s: Schedule,
  y: number,
  m: number,
  d: number,
  weekday: number,
): [number, number] | null {
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const ex = s.exceptions.find((e) => e.date === key);
  const src = ex ?? s.regularHours.find((h) => h.day === weekday);
  if (!src || src.closed || !src.open || !src.close) return null;
  const a = toMinutes(src.open);
  const b = toMinutes(src.close);
  return b > a ? [a, b] : null;
}

/**
 * `from` plus `hours` of opening time. Time outside opening hours (nights, closed days, exceptions)
 * does not count; a request made while closed starts counting when the location next opens.
 */
export function addBusinessHours(from: Date, hours: number, schedule: Schedule | null): Date {
  if (!schedule || !schedule.regularHours.length)
    return new Date(from.getTime() + hours * 60 * MIN);
  let remaining = Math.max(0, Math.round(hours * 60));
  let cursor = from;
  for (let day = 0; day <= MAX_DAYS; day++) {
    const l = localParts(cursor, schedule.timezone);
    const interval = openInterval(schedule, l.y, l.m, l.d, l.weekday);
    if (interval) {
      const [open, close] = interval;
      const startAt = Math.max(l.minutes, open);
      if (startAt < close) {
        const available = close - startAt;
        if (remaining <= available)
          return zoned(l.y, l.m, l.d, startAt + remaining, schedule.timezone);
        remaining -= available;
      }
    }
    // next local day, at midnight
    cursor = zoned(l.y, l.m, l.d + 1, 0, schedule.timezone);
  }
  // never open: fall back to plain elapsed hours rather than a date centuries away
  return new Date(from.getTime() + hours * 60 * MIN);
}
