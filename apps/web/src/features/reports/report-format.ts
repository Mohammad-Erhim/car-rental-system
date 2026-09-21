import type { ReportFormat, ReportKpi } from '@carrental/contracts';
import type { I18nContextValue } from '@carrental/i18n/react';

import { humanize, labelFor } from '@/lib/labels';

/**
 * How report figures read: money in its currency, shares as percentages, everything else with
 * digit grouping — and "—", never 0, for a figure that cannot be worked out (no bookings to average).
 */
export function formatValue(
  { fmt, t }: Pick<I18nContextValue, 't' | 'fmt'>,
  format: ReportFormat,
  value: unknown,
  currency: string | null,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'text' || format === 'date') return String(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  switch (format) {
    case 'money':
      return currency ? fmt.money({ amountMinor: value, currency }) : fmt.number(value);
    case 'percent':
      return fmt.percent(value, { maximumFractionDigits: 1 });
    case 'hours':
      return t('ops.rpt.unit.hours', { n: fmt.number(value, { maximumFractionDigits: 1 }) });
    case 'km':
      return t('ops.rpt.unit.km', { n: fmt.number(value, { maximumFractionDigits: 0 }) });
    case 'decimal':
      return fmt.number(value, { maximumFractionDigits: 1 });
    default:
      return fmt.number(value);
  }
}

/** The name of a measure ("net_minor" → "Revenue (ex tax)"): translated, else made readable. */
export const measureLabel = (
  i18n: Pick<I18nContextValue, 't' | 'resolvedLocaleFor'>,
  key: string,
) => labelFor(i18n, `ops.rpt.m.${key}`, key.replace(/_minor$/, ''));

/** A sentence explaining a measure, when there is one. */
export function measureHint(
  { t, resolvedLocaleFor }: Pick<I18nContextValue, 't' | 'resolvedLocaleFor'>,
  key: string,
): string | null {
  const k = `ops.rpt.mh.${key}`;
  return resolvedLocaleFor(k) === null ? null : t(k);
}

/** A row of a breakdown ("Compact", "Heathrow", "Cancelled"): the name the API knows, else ours. */
export function rowLabel(
  i18n: Pick<I18nContextValue, 't' | 'resolvedLocaleFor'>,
  breakdown: string,
  row: { key: string; label?: string },
): string {
  if (breakdown === 'category' || breakdown === 'location') return row.label ?? humanize(row.key);
  for (const k of [
    `ops.rpt.bv.${breakdown}.${row.key}`,
    `ops.status.${row.key}`,
    `ops.fleet.unitState.${row.key}`,
  ]) {
    if (i18n.resolvedLocaleFor(k) !== null) return i18n.t(k);
  }
  return row.label ?? humanize(row.key.replace(/^\d+_/, ''));
}

export interface Change {
  /** the difference as a fraction of the previous value (or in points for a share) */
  amount: number;
  kind: 'relative' | 'points';
  direction: 'up' | 'down' | 'flat';
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * How a figure moved against the comparison. Shares (percent) move in points, everything else in
 * per cent. Colour says whether the move is good news for the business — a rising cancellation
 * rate is red, a rising revenue green — the arrow only says which way it went. Nothing is said when
 * there is nothing to compare against.
 */
export function changeOf(
  kpi: Pick<ReportKpi, 'value' | 'previous' | 'format' | 'betterWhen'>,
): Change | null {
  const { value, previous, format, betterWhen } = kpi;
  if (value === null || previous === null) return null;
  let amount: number;
  let kind: Change['kind'];
  if (format === 'percent') {
    amount = value - previous;
    kind = 'points';
  } else {
    if (previous === 0)
      return value === 0
        ? { amount: 0, kind: 'relative', direction: 'flat', tone: 'neutral' }
        : null;
    amount = (value - previous) / Math.abs(previous);
    kind = 'relative';
  }
  const flat = Math.abs(amount) < 0.0005;
  const direction = flat ? 'flat' : amount > 0 ? 'up' : 'down';
  const tone =
    flat || betterWhen === 'neutral'
      ? 'neutral'
      : (direction === 'up') === (betterWhen === 'up')
        ? 'good'
        : 'bad';
  return { amount, kind, direction, tone };
}

/** "+12.5 %" or "−3.1 pts" */
export function changeText({ t, fmt }: Pick<I18nContextValue, 't' | 'fmt'>, c: Change): string {
  const sign = c.direction === 'up' ? '+' : c.direction === 'down' ? '−' : '';
  if (c.kind === 'points')
    return t('ops.rpt.delta.points', {
      n: `${sign}${fmt.number(Math.abs(c.amount) * 100, { maximumFractionDigits: 1 })}`,
    });
  return `${sign}${fmt.percent(Math.abs(c.amount), { maximumFractionDigits: 1 })}`;
}
