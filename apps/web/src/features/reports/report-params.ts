import {
  REPORT_BASES,
  REPORT_COMPARE,
  REPORT_GRANULARITIES,
  REPORT_PRESETS,
  type ReportBasis,
  type ReportCompare,
  type ReportGranularity,
  type ReportPreset,
} from '@carrental/contracts';

/**
 * What a person picked on the report page, kept in the address (so a view can be shared, bookmarked
 * and survives a refresh) and turned into what the API is asked. Anything unknown falls back to the
 * default rather than breaking the page.
 */
export interface ReportView {
  report: string;
  preset: ReportPreset;
  from: string;
  to: string;
  compare: ReportCompare;
  basis: ReportBasis;
  /** '' = chosen for the length of the period */
  granularity: ReportGranularity | '';
  categories: string[];
  currency: string;
}

export const VIEW_KEYS = [
  'report',
  'preset',
  'from',
  'to',
  'compare',
  'basis',
  'gran',
  'cat',
  'cur',
] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

export const DEFAULT_REPORT = 'overview';

/** reports built on a reservation's date, where the choice of date changes the answer */
export const BASIS_REPORTS = new Set(['overview', 'sales', 'bookings']);
/** the single-table reports that predate the period-based ones; they still run, from the Checks tab */
export const LEGACY_REPORTS = new Set([
  'reservations_by_state',
  'revenue_by_category',
  'fleet_utilisation',
  'refunds',
]);

const oneOf = <T extends string>(list: readonly T[], v: string, fallback: T): T =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readView(state: Record<ViewKey, string>): ReportView {
  return {
    report: state.report || DEFAULT_REPORT,
    preset: oneOf(REPORT_PRESETS, state.preset, 'last_30_days'),
    from: DAY.test(state.from) ? state.from : '',
    to: DAY.test(state.to) ? state.to : '',
    compare: oneOf(REPORT_COMPARE, state.compare, 'previous'),
    basis: oneOf(REPORT_BASES, state.basis, 'booked'),
    granularity: oneOf(REPORT_GRANULARITIES, state.gran, '' as ReportGranularity),
    categories: state.cat ? state.cat.split(',').filter(Boolean) : [],
    currency: /^[A-Z]{3}$/.test(state.cur) ? state.cur : '',
  };
}

/** Whether the custom range is complete enough to ask for. */
export const isReady = (v: ReportView) =>
  v.preset !== 'custom' || (v.from !== '' && v.to !== '' && v.from <= v.to);

export function toApiParams(v: ReportView, locationCode?: string): Record<string, unknown> {
  return {
    preset: v.preset,
    ...(v.preset === 'custom' ? { from: v.from, to: v.to } : {}),
    compare: v.compare,
    basis: v.basis,
    ...(v.granularity ? { granularity: v.granularity } : {}),
    ...(v.categories.length ? { categoryCodes: v.categories } : {}),
    ...(v.currency ? { currency: v.currency } : {}),
    ...(locationCode ? { locationCode } : {}),
  };
}

/** The same choices kept on a schedule: no dates (a schedule is always relative) and no one-off currency. */
export function toScheduleParams(v: ReportView): Record<string, unknown> {
  const {
    preset,
    from: _f,
    to: _t,
    ...rest
  } = toApiParams(v) as Record<string, unknown> & {
    preset: ReportPreset;
    from?: string;
    to?: string;
  };
  return { ...rest, preset: preset === 'custom' ? 'last_30_days' : preset };
}
