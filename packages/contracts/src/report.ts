import { z } from 'zod';

/**
 * The reporting hub: the time frame a report covers and the shape of what it returns. One
 * contract for the API, the dashboard and the scheduled e-mail, so a number is defined once.
 *
 * Numbers: `money` is integer minor units of the report currency; `percent` is a fraction (0.25 = 25 %);
 * `days`/`hours`/`km`/`decimal` are plain numbers.
 *
 * Time frame rules (the same everywhere):
 *  - a period is whole calendar days in the report's time zone, `from` and `to` both included;
 *  - a *preset* ("last 7 days", "last month") is resolved on the server against "today" in that
 *    time zone, so a scheduled report always means the same thing when it runs;
 *  - the comparison period is the same length immediately before, or the same dates a year earlier;
 *  - the date basis says which date of a reservation places it in the period.
 */
export const REPORT_PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom',
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_COMPARE = ['previous', 'year', 'none'] as const;
export type ReportCompare = (typeof REPORT_COMPARE)[number];

/** booked = the day the booking was confirmed · pickup = the day the trip starts · return = the day it ends */
export const REPORT_BASES = ['booked', 'pickup', 'return'] as const;
export type ReportBasis = (typeof REPORT_BASES)[number];

export const REPORT_GRANULARITIES = ['day', 'week', 'month'] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** What a person asks of an analytic report. Everything is optional: the defaults are "last 30 days". */
export const zReportParams = z.object({
  preset: z.enum(REPORT_PRESETS).default('last_30_days'),
  /** only for `custom` */
  from: zDay.optional(),
  to: zDay.optional(),
  compare: z.enum(REPORT_COMPARE).default('previous'),
  basis: z.enum(REPORT_BASES).default('booked'),
  granularity: z.enum(REPORT_GRANULARITIES).optional(),
  /** narrows within the person's own location scope; never widens it */
  locationCode: z.union([z.string().max(1000), z.array(z.string().max(40)).max(200)]).optional(),
  categoryCodes: z.array(z.string().max(60)).max(100).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});
export type ReportParams = z.infer<typeof zReportParams>;

export type ReportFormat =
  | 'money'
  | 'count'
  | 'percent'
  | 'decimal'
  | 'days'
  | 'hours'
  | 'km'
  | 'text'
  | 'date';

export interface ReportPeriod {
  preset: ReportPreset;
  /** first and last day, in the report time zone */
  from: string;
  to: string;
  days: number;
  compare: { from: string; to: string; kind: Exclude<ReportCompare, 'none'> } | null;
  granularity: ReportGranularity;
  basis: ReportBasis;
  /** IANA zone the day boundaries are cut in */
  timezone: string;
}

export interface ReportKpi {
  key: string;
  format: ReportFormat;
  value: number | null;
  /** same measure over the comparison period; null when there is none or nothing to compare */
  previous: number | null;
  /** which way is good news — decides the colour of the change, never the arrow */
  betterWhen: 'up' | 'down' | 'neutral';
  /** a point-in-time figure ("unpaid balance now"), not a measure of the period */
  snapshot?: boolean;
}

export interface ReportSeriesPoint {
  /** first day of the bucket, YYYY-MM-DD in the report time zone */
  start: string;
  values: Record<string, number>;
  /** the aligned bucket of the comparison period */
  previous?: Record<string, number>;
  previousStart?: string;
}

export interface ReportSeries {
  granularity: ReportGranularity;
  /** the measures drawn, in order: the first is the main one */
  measures: Array<{ key: string; format: ReportFormat }>;
  points: ReportSeriesPoint[];
}

export interface ReportBreakdownColumn {
  key: string;
  format: ReportFormat;
  /** the column the shares (bars) are drawn from */
  share?: boolean;
  /** whether the totals row adds this column up (false for rates and averages, which are recomputed) */
  additive?: boolean;
}

export interface ReportBreakdownRow {
  key: string;
  /** the name the system knows it by ("Compact", "Heathrow"); the dashboard falls back to the key */
  label?: string;
  values: Record<string, number | null>;
  previous?: Record<string, number | null>;
}

export interface ReportBreakdown {
  /** what the rows are: category · location · channel · state · lead_time · length · reason · purpose · method · … */
  key: string;
  columns: ReportBreakdownColumn[];
  rows: ReportBreakdownRow[];
  totals: Record<string, number | null>;
  /** a picture of now, not of the period: shown without a comparison */
  snapshot?: boolean;
}

export interface ReportTable {
  columns: Array<{ key: string; format: ReportFormat }>;
  rows: Array<Record<string, unknown>>;
  /** true when more rows matched than are listed */
  truncated: boolean;
  total: number;
}

/** What an analytic report returns, whether it is previewed or saved as a run. */
export interface AnalyticReport {
  code: string;
  title: string;
  period: ReportPeriod;
  currency: string | null;
  /** currencies with activity in the period; figures are for `currency` only */
  currencies: string[];
  /** activity left out because it is in another currency */
  otherCurrencies: Array<{ currency: string; count: number }>;
  scope: { locations: string[] | null; categories: string[] | null };
  /** the vehicle categories that can be filtered on (the organisation's active ones) */
  categories: Array<{ code: string; name: string }>;
  generatedAt: string;
  kpis: ReportKpi[];
  series: ReportSeries | null;
  breakdowns: ReportBreakdown[];
  detail: ReportTable | null;
  /** keys of plain-language definitions the page shows under "How this is calculated" */
  notes: string[];
}
