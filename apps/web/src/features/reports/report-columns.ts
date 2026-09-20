import type { I18nContextValue } from '@carrental/i18n/react';

import { humanize, labelFor } from '@/lib/labels';

type Tr = Pick<I18nContextValue, 't' | 'fmt' | 'resolvedLocaleFor'>;
export type ReportRow = Record<string, unknown>;

/**
 * How a report's columns are shown: a heading a person can read ("Total" not "totalMinor"), money in
 * its own currency, counts with digit grouping, states in words. The API sends stable keys; this is
 * the one place they become text, so every report — and any added later — reads the same way.
 */
const isMoney = (key: string) => key.endsWith('Minor');

export function columnLabel(i18n: Tr, key: string): string {
  return labelFor(i18n, `ops.rpt.col.${key}`, isMoney(key) ? key.slice(0, -5) : key);
}

/** Numbers line up on the right, like every other table of figures. */
export const isNumericColumn = (key: string, rows: ReportRow[]) =>
  rows.length > 0 && rows.every((r) => r[key] === null || typeof r[key] === 'number');

export function cellText(i18n: Tr, key: string, row: ReportRow): string {
  const v = row[key];
  if (v === null || v === undefined || v === '') return '—';
  if (isMoney(key) && typeof v === 'number' && typeof row.currency === 'string')
    return i18n.fmt.money({ amountMinor: v, currency: row.currency });
  if (typeof v === 'number') return i18n.fmt.number(v);
  const text = String(v);
  if (key === 'state') {
    // reservation states and vehicle states share the column name
    const own = [`ops.status.${text}`, `ops.fleet.unitState.${text}`].find(
      (k) => i18n.resolvedLocaleFor(k) !== null,
    );
    return own ? i18n.t(own) : humanize(text);
  }
  if (key === 'severity' || key === 'kind' || key === 'categoryCode')
    return labelFor(i18n, `ops.rpt.val.${text}`, text);
  return text;
}

/** A file name a person can recognise in Downloads: "report-<code>-2026-09-21.csv". */
export const csvName = (code: string, on: Date) =>
  `report-${code.replace(/_/g, '-')}-${on.toISOString().slice(0, 10)}.csv`;

/** The scope the API records ("All locations" / "Scoped to LHR, CDG") in the person's language. */
export function scopeText(
  { t }: Pick<I18nContextValue, 't'>,
  note: string | null | undefined,
  nameOf: (code: string) => string,
): string {
  if (!note) return '—';
  if (note === 'All locations') return t('ops.rpt.scopeAll');
  const m = /^Scoped to (.+)$/.exec(note);
  return m ? t('ops.rpt.scopeTo', { names: m[1]!.split(', ').map(nameOf).join(', ') }) : note;
}

/** Columns worth showing: not an internal id, and not empty in every row (an "Error" column that is always blank). */
export function visibleColumns(keys: string[], rows: ReportRow[]): string[] {
  if (!rows.length) return keys;
  const shown = keys.filter(
    (k) => k !== 'id' && rows.some((r) => r[k] !== null && r[k] !== undefined && r[k] !== ''),
  );
  return shown.length ? shown : keys;
}
