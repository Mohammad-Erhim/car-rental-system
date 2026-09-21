import type { AnalyticReport, ReportFormat } from '@carrental/contracts';
import { minorToMajor, minorUnitDigits } from '@carrental/i18n';
import type { I18nContextValue } from '@carrental/i18n/react';

import { changeOf, measureLabel, rowLabel } from './report-format';

import { csvCell } from '@/lib/csv';

type Tr = Pick<I18nContextValue, 't' | 'resolvedLocaleFor'>;

/** a number the way a spreadsheet wants it: no grouping, a dot for the decimals */
function plain(format: ReportFormat, value: unknown, currency: string | null): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return String(value);
  if (format === 'money' && currency) {
    return minorToMajor({ amountMinor: value, currency }).toFixed(minorUnitDigits(currency));
  }
  if (format === 'percent') return (Math.round(value * 10_000) / 100).toString();
  return (Math.round(value * 100) / 100).toString();
}

const BOM = String.fromCharCode(0xfeff);

/** numbers stay numbers (a negative one must not be turned into text by the formula guard) */
const cell = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? v : csvCell(v));

const head = (i18n: Tr, key: string, format: ReportFormat, currency: string | null) => {
  const label = measureLabel(i18n, key);
  if (format === 'money' && currency) return `${label} (${currency})`;
  if (format === 'percent') return `${label} (%)`;
  return label;
};

/**
 * A report as a spreadsheet: who/what/when at the top, then the summary, the trend, each breakdown
 * and the detail — every section with words for headings and plain numbers below, so it can be
 * pivoted or charted without cleaning. Sections are separated by a blank line.
 */
export function analyticCsv(
  i18n: Tr,
  report: AnalyticReport,
  info: { title: string; scope: string; basis: string; compare: string; generated: string },
): string {
  const { t } = i18n;
  const cur = report.currency;
  const lines: string[][] = [];
  const blank = () => lines.push([]);
  lines.push([info.title]);
  lines.push([t('ops.rpt.csv.period'), `${report.period.from} – ${report.period.to}`]);
  if (report.period.compare)
    lines.push([
      t('ops.rpt.csv.comparedWith'),
      `${report.period.compare.from} – ${report.period.compare.to}`,
      info.compare,
    ]);
  lines.push([t('ops.rpt.csv.basis'), info.basis]);
  lines.push([t('ops.rpt.csv.timezone'), report.period.timezone]);
  if (cur) lines.push([t('ops.rpt.csv.currency'), cur]);
  lines.push([t('ops.rpt.csv.scope'), info.scope]);
  lines.push([t('ops.rpt.csv.generated'), info.generated]);
  blank();

  lines.push([t('ops.rpt.csv.summary')]);
  lines.push([
    t('ops.rpt.csv.measure'),
    t('ops.rpt.csv.value'),
    ...(report.period.compare ? [t('ops.rpt.csv.previous'), t('ops.rpt.csv.change')] : []),
  ]);
  for (const k of report.kpis) {
    const c = changeOf(k);
    lines.push([
      head(i18n, k.key, k.format, cur),
      plain(k.format, k.value, cur),
      ...(report.period.compare
        ? [
            plain(k.format, k.previous, cur),
            c ? plain('percent', c.kind === 'points' ? c.amount : c.amount, null) : '',
          ]
        : []),
    ]);
  }

  if (report.series?.points.length) {
    blank();
    lines.push([t('ops.rpt.csv.trend')]);
    const hasPrev = report.series.points.some((p) => p.previous);
    lines.push([
      t('ops.rpt.csv.periodStart'),
      ...report.series.measures.flatMap((m) => [
        head(i18n, m.key, m.format, cur),
        ...(hasPrev ? [`${head(i18n, m.key, m.format, cur)} — ${t('ops.rpt.csv.previous')}`] : []),
      ]),
    ]);
    for (const p of report.series.points)
      lines.push([
        p.start,
        ...report.series.measures.flatMap((m) => [
          plain(m.format, p.values[m.key], cur),
          ...(hasPrev ? [plain(m.format, p.previous?.[m.key], cur)] : []),
        ]),
      ]);
  }

  for (const b of report.breakdowns) {
    if (!b.rows.length) continue;
    blank();
    lines.push([t(`ops.rpt.b.${b.key}`)]);
    lines.push([
      t(`ops.rpt.b.${b.key}`),
      ...b.columns.map((c) => head(i18n, c.key, c.format, cur)),
    ]);
    for (const r of b.rows)
      lines.push([
        rowLabel(i18n, b.key, r),
        ...b.columns.map((c) => plain(c.format, r.values[c.key], cur)),
      ]);
    lines.push([
      t('ops.rpt.total'),
      ...b.columns.map((c) => plain(c.format, b.totals[c.key], cur)),
    ]);
  }

  if (report.detail?.rows.length) {
    blank();
    lines.push([t('ops.rpt.detail')]);
    lines.push(report.detail.columns.map((c) => head(i18n, c.key, c.format, cur)));
    for (const r of report.detail.rows)
      lines.push(
        report.detail.columns.map((c) =>
          plain(c.format, r[c.key], String(r.currency ?? cur ?? '') || null),
        ),
      );
  }
  // a leading byte-order mark makes Excel read the file as UTF-8 (Arabic and accents survive)
  return `${BOM}${lines.map((row) => row.map((c) => cell(c)).join(',')).join('\r\n')}\r\n`;
}
