import { sql, type SQL } from 'drizzle-orm';

import { bucketIndex, type Bucket } from './period';
import type { AnalyticCtx, DayRange } from './types';

/**
 * Small SQL pieces every report shares. Days are cut in the report's time zone: a day `D` starts at
 * `D 00:00` there and the period ends where the day *after* its last day starts.
 */

/** `col in ('a','b')`, or `false` for an empty list — postgres.js cannot bind a bare JS array. */
export const inList = (col: SQL, values: readonly string[]): SQL =>
  values.length
    ? sql`${col} in (${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      )})`
    : sql`false`;

/** `col in (scope)`, or `true` when the person may see everything. */
export const inScope = (col: SQL, scope: readonly string[] | null): SQL =>
  scope ? inList(col, scope) : sql`true`;

export const inCategories = (col: SQL, categories: readonly string[] | null): SQL =>
  categories?.length ? inList(col, categories) : sql`true`;

export const dayStart = (day: string, tz: string): SQL =>
  sql`((${day}::date)::timestamp at time zone ${tz})`;
export const dayEndExclusive = (day: string, tz: string): SQL =>
  sql`((${day}::date + 1)::timestamp at time zone ${tz})`;

/** `col` falls inside the days of `range` */
export const within = (col: SQL, ctx: Pick<AnalyticCtx, 'period'>, range: DayRange): SQL =>
  sql`(${col} >= ${dayStart(range.from, ctx.period.timezone)} and ${col} < ${dayEndExclusive(range.to, ctx.period.timezone)})`;

/** the calendar day (in the report zone) an instant falls on, as `YYYY-MM-DD` */
export const localDay = (col: SQL, tz: string): SQL =>
  sql`to_char((${col} at time zone ${tz})::date, 'YYYY-MM-DD')`;

/** the reservation timestamp that places a booking in a period, by the chosen date basis */
export const basisColumn = (basis: 'booked' | 'pickup' | 'return', alias = 'r'): SQL => {
  const a = sql.raw(alias);
  return basis === 'pickup'
    ? sql`${a}.pickup_at`
    : basis === 'return'
      ? sql`${a}.return_at`
      : sql`coalesce(${a}.confirmed_at, ${a}.created_at)`;
};

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** a / b, or null when there is nothing to divide by */
export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** One empty record per bucket, so every bucket is drawn even on a quiet day. */
export const emptySeries = (buckets: Bucket[], keys: string[]): Array<Record<string, number>> =>
  buckets.map(() => Object.fromEntries(keys.map((k) => [k, 0])));

/** Adds per-day rows into their buckets. */
export function foldDays<T extends { day: string }>(
  buckets: Bucket[],
  rows: T[],
  keys: string[],
  read: (row: T, key: string) => number,
): Array<Record<string, number>> {
  const out = emptySeries(buckets, keys);
  for (const row of rows) {
    const i = bucketIndex(row.day, buckets);
    if (i < 0) continue;
    for (const k of keys) out[i]![k] = out[i]![k]! + read(row, k);
  }
  return out;
}

/** JS number from a Postgres bigint/numeric that may arrive as a string */
export const int = (v: unknown): number => Math.round(num(v));
