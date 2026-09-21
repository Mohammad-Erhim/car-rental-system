import type { AnalyticReport } from '@carrental/contracts';
import { createFormatters } from '@carrental/i18n';
import { describe, expect, it } from 'vitest';

import { analyticCsv } from './report-csv';

const i18n = {
  t: (k: string) => k.split('.').at(-1)!,
  resolvedLocaleFor: () => null,
  fmt: createFormatters('en'),
};
const report = {
  code: 'sales',
  title: 'Sales',
  period: {
    preset: 'custom',
    from: '2026-09-01',
    to: '2026-09-30',
    days: 30,
    granularity: 'week',
    basis: 'booked',
    timezone: 'America/New_York',
    compare: { kind: 'previous', from: '2026-08-02', to: '2026-08-31' },
  },
  currency: 'USD',
  currencies: ['USD'],
  otherCurrencies: [],
  scope: { locations: null, categories: null },
  categories: [],
  generatedAt: '2026-09-21T00:00:00Z',
  kpis: [
    { key: 'net_minor', format: 'money', value: 123450, previous: 100000, betterWhen: 'up' },
    {
      key: 'cancellation_rate',
      format: 'percent',
      value: 0.05,
      previous: 0.08,
      betterWhen: 'down',
    },
  ],
  series: {
    granularity: 'week',
    measures: [{ key: 'net_minor', format: 'money' }],
    points: [{ start: '2026-09-01', values: { net_minor: 5000 }, previous: { net_minor: 4000 } }],
  },
  breakdowns: [
    {
      key: 'category',
      columns: [{ key: 'net_minor', format: 'money' }],
      rows: [{ key: 'suv', label: 'SUV, large', values: { net_minor: 5000 } }],
      totals: { net_minor: 5000 },
    },
  ],
  detail: {
    columns: [
      { key: 'reference', format: 'text' },
      { key: 'net_minor', format: 'money' },
    ],
    rows: [{ reference: '=cmd()', net_minor: -2500, currency: 'USD' }],
    truncated: false,
    total: 1,
  },
  notes: [],
} as unknown as AnalyticReport;
const info = {
  title: 'Sales & revenue',
  scope: 'All locations',
  basis: 'Booking date',
  compare: 'the period before',
  generated: 'now',
};

describe('report spreadsheet', () => {
  const csv = analyticCsv(i18n, report, info);
  const lines = csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');

  it('starts with a byte-order mark so Excel reads accents and Arabic', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('says what it is at the top: title, days, comparison, zone, currency', () => {
    expect(lines[0]).toBe('"Sales & revenue"');
    expect(lines).toContain('"period","2026-09-01 – 2026-09-30"');
    expect(lines.some((l) => l.includes('America/New_York'))).toBe(true);
    expect(lines.some((l) => l.includes('USD'))).toBe(true);
  });

  it('writes money in major units, shares as percent, with the unit in the heading', () => {
    expect(lines).toContain('"Net (USD)",1234.50,1000.00,23.45');
    expect(lines.some((l) => l.startsWith('"Cancellation rate (%)",5,8'))).toBe(true);
  });

  it('keeps a comma inside a name in one cell, and a negative number a number', () => {
    expect(lines).toContain('"SUV, large",50.00');
    expect(lines.some((l) => l.endsWith(',-25.00'))).toBe(true);
  });

  it('does not let a cell run as a formula', () => {
    expect(lines.some((l) => l.startsWith(`"'=cmd()"`))).toBe(true);
  });

  it('has a total row per breakdown', () => {
    expect(lines).toContain('"total",50.00');
  });
});
