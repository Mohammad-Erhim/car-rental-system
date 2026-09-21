import type {
  ReportBreakdownColumn,
  ReportFormat,
  ReportKpi,
  ReportPeriod,
  ReportTable,
} from '@carrental/contracts';
import type { SQL } from 'drizzle-orm';

import type { Database } from '../../../database/drizzle';

import type { Bucket } from './period';

/** Everything a measure needs to know about who is asking and what they asked. */
export interface AnalyticCtx {
  db: Database;
  orgId: string;
  /** the branches the person may see (already narrowed by what they asked); null = all */
  scope: string[] | null;
  categories: string[] | null;
  period: ReportPeriod;
  /** the currency the money figures are in */
  currency: string;
  now: Date;
}

/** A run of whole days, in the report's time zone. */
export interface DayRange {
  from: string;
  to: string;
}

export type BreakdownRows = Array<{
  key: string;
  label?: string;
  values: Record<string, number | null>;
}>;

/** The figures for one period; the composer runs this for the period and for its comparison. */
export interface Measure {
  kpis: Record<string, number | null>;
  /** one entry per bucket, in order */
  series: Array<Record<string, number>>;
  breakdowns: Record<string, { rows: BreakdownRows; totals?: Record<string, number | null> }>;
  detail?: ReportTable;
}

export interface KpiSpec {
  key: string;
  format: ReportFormat;
  betterWhen: ReportKpi['betterWhen'];
  snapshot?: boolean;
}

export interface BreakdownSpec {
  key: string;
  columns: ReportBreakdownColumn[];
  /** a picture of now, not of the period: no comparison */
  snapshot?: boolean;
}

export interface AnalyticDef {
  code: string;
  /** whether the date basis changes the answer (only reservation-based reports) */
  usesBasis: boolean;
  kpis: KpiSpec[];
  series: Array<{ key: string; format: ReportFormat }> | null;
  breakdowns: BreakdownSpec[];
  notes: string[];
  /** activity per currency in the period, so a currency can be chosen and the rest disclosed */
  currencyActivity(
    ctx: Omit<AnalyticCtx, 'currency'>,
    range: DayRange,
  ): Promise<Array<{ currency: string; count: number }>>;
  measure(
    ctx: AnalyticCtx,
    range: DayRange,
    buckets: Bucket[],
    opts: { detail: boolean },
  ): Promise<Measure>;
}

export type Frag = SQL;
export const DETAIL_LIMIT = 1000;
