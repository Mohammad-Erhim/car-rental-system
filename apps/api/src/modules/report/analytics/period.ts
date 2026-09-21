import type {
  ReportGranularity,
  ReportParams,
  ReportPeriod,
  ReportPreset,
} from '@carrental/contracts';

import { AppError } from '../../../common/app-error';

/**
 * Time-frame arithmetic for reports. Everything here works on calendar days written `YYYY-MM-DD`
 * *in the report's time zone* — never on instants — so "last month" means the same days whatever
 * the server clock says, and a day is 23 or 25 hours long on a daylight-saving change without any
 * special handling. Queries turn a day into an instant only at the edge (`day::timestamp AT TIME
 * ZONE tz`).
 */

const DAY_MS = 86_400_000;
export const MAX_PERIOD_DAYS = 731;
/** the finest grouping a long period may use — 200 daily bars are noise, not information */
const MAX_DAILY_DAYS = 92;

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fmt(new Date(toDate(d).getTime() + n * DAY_MS));
/** inclusive count of days between two days */
export const daysBetween = (from: string, to: string) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS) + 1;

export function addMonths(d: string, n: number): string {
  const x = toDate(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return fmt(x);
}
const startOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
const endOfMonth = (d: string) => addDays(addMonths(startOfMonth(d), 1), -1);
const startOfQuarter = (d: string) => {
  const m = Number(d.slice(5, 7));
  return `${d.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
};
/** ISO week: Monday */
const startOfWeek = (d: string) => addDays(d, -((toDate(d).getUTCDay() + 6) % 7));

/** today's date in an IANA zone */
export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const invalid = (path: string, code: string) => AppError.validation([{ path, code }]);

/** The days a preset stands for, counted from "today" in the report's time zone. */
export function presetRange(preset: Exclude<ReportPreset, 'custom'>, today: string) {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last_7_days':
      return { from: addDays(today, -6), to: today };
    case 'last_30_days':
      return { from: addDays(today, -29), to: today };
    case 'this_month':
      return { from: startOfMonth(today), to: today };
    case 'last_month': {
      const first = addMonths(startOfMonth(today), -1);
      return { from: first, to: endOfMonth(first) };
    }
    case 'this_quarter':
      return { from: startOfQuarter(today), to: today };
    case 'last_quarter': {
      const first = addMonths(startOfQuarter(today), -3);
      return { from: first, to: addDays(addMonths(first, 3), -1) };
    }
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'last_year': {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
  }
}

/**
 * "The period before". A calendar preset is compared with the calendar period before it, and a
 * running one (this month so far) with the same number of days at the start of the one before, so a
 * half-finished month is never set against a whole one. Anything else is the same number of days
 * straight before.
 */
export function previousPeriod(
  preset: ReportPreset,
  range: { from: string; to: string },
  days: number,
): { from: string; to: string } {
  const running = (months: number, end: (first: string) => string) => {
    const from = addMonths(range.from, -months);
    const whole = end(from);
    const to = addDays(from, days - 1);
    return { from, to: to < whole ? to : whole };
  };
  switch (preset) {
    case 'this_month':
      return running(1, endOfMonth);
    case 'this_quarter':
      return running(3, (f) => addDays(addMonths(f, 3), -1));
    case 'this_year':
      return running(12, (f) => `${f.slice(0, 4)}-12-31`);
    case 'last_month': {
      const from = addMonths(range.from, -1);
      return { from, to: endOfMonth(from) };
    }
    case 'last_quarter': {
      const from = addMonths(range.from, -3);
      return { from, to: addDays(addMonths(from, 3), -1) };
    }
    case 'last_year':
      return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
    default: {
      const to = addDays(range.from, -1);
      return { from: addDays(to, -(days - 1)), to };
    }
  }
}

export function defaultGranularity(days: number): ReportGranularity {
  return days <= 31 ? 'day' : days <= 180 ? 'week' : 'month';
}

/**
 * Turns what a person asked for into a concrete period. A period that cannot be honoured (no dates
 * for `custom`, the end before the start, more than two years) is refused, never silently changed.
 */
export function resolvePeriod(
  params: Pick<ReportParams, 'preset' | 'from' | 'to' | 'compare' | 'basis' | 'granularity'>,
  timezone: string,
  now: Date,
): ReportPeriod {
  let range: { from: string; to: string };
  if (params.preset === 'custom') {
    if (!params.from || !params.to) throw invalid('from', 'dates_required');
    range = { from: params.from, to: params.to };
    for (const [k, v] of Object.entries(range)) {
      if (Number.isNaN(toDate(v).getTime()) || fmt(toDate(v)) !== v)
        throw invalid(k, 'invalid_date');
    }
    if (range.to < range.from) throw invalid('to', 'end_before_start');
  } else {
    range = presetRange(params.preset, todayIn(timezone, now));
  }
  const days = daysBetween(range.from, range.to);
  if (days > MAX_PERIOD_DAYS) throw invalid('to', 'period_too_long');

  let compare: ReportPeriod['compare'] = null;
  if (params.compare === 'previous') {
    compare = { kind: 'previous', ...previousPeriod(params.preset, range, days) };
  } else if (params.compare === 'year') {
    compare = {
      kind: 'year',
      from: addMonths(range.from, -12),
      to: addMonths(range.to, -12),
    };
  }

  const wanted = params.granularity ?? defaultGranularity(days);
  const granularity = wanted === 'day' && days > MAX_DAILY_DAYS ? 'week' : wanted;
  return {
    preset: params.preset,
    ...range,
    days,
    compare,
    granularity,
    basis: params.basis,
    timezone,
  };
}

export interface Bucket {
  /** first day of the bucket, never earlier than the period starts */
  start: string;
  /** last day, never later than the period ends */
  end: string;
}

/** The buckets a period is grouped into: days, ISO weeks (Mon–Sun) or calendar months. */
export function buckets(from: string, to: string, granularity: ReportGranularity): Bucket[] {
  const out: Bucket[] = [];
  let cursor = from;
  while (cursor <= to) {
    let end: string;
    if (granularity === 'day') end = cursor;
    else if (granularity === 'week') end = addDays(startOfWeek(cursor), 6);
    else end = endOfMonth(cursor);
    if (end > to) end = to;
    out.push({ start: cursor, end });
    cursor = addDays(end, 1);
  }
  return out;
}

/** Which bucket a day falls in (buckets are contiguous and sorted). */
export function bucketIndex(day: string, list: Bucket[]): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (day < list[mid]!.start) hi = mid - 1;
    else if (day > list[mid]!.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Change against the comparison, as a fraction (0.12 = +12 %). Null when it is not meaningful. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * The time zone a report cuts its days in: the one branch's zone when the report is about one
 * branch, else the zone most of the branches in scope share (ties: alphabetical) so the answer is
 * always the same for the same scope.
 */
export function reportTimezone(zones: string[]): string {
  if (!zones.length) return 'UTC';
  const count = new Map<string, number>();
  for (const z of zones) count.set(z, (count.get(z) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}
