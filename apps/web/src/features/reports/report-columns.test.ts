import { createFormatters } from '@carrental/i18n';
import { describe, expect, it } from 'vitest';

import {
  cellText,
  columnLabel,
  csvName,
  isNumericColumn,
  reportTitle,
  scopeText,
  visibleColumns,
} from './report-columns';

const texts: Record<string, string> = {
  'ops.rpt.col.totalMinor': 'Total value',
  'ops.status.confirmed': 'Confirmed',
  'ops.fleet.unitState.on_rent': 'On rent',
  'ops.rpt.scopeAll': 'All locations',
  'ops.rpt.scopeTo': 'Only {names}',
  'ops.rpt.def.refunds.title': 'Synthèse',
  'ops.dq.check.unit_orphan_location': 'Véhicules orphelins',
};
const i18n = {
  t: (k: string, p?: Record<string, unknown>) =>
    (texts[k] ?? k).replace('{names}', String(p?.names ?? '')),
  resolvedLocaleFor: (k: string) => (k in texts ? 'en' : null),
  fmt: createFormatters('en'),
};

describe('report columns', () => {
  it('heads a column with words, not the API key', () => {
    expect(columnLabel(i18n, 'totalMinor')).toBe('Total value');
    expect(columnLabel(i18n, 'refundedMinor')).toBe('Refunded');
    expect(columnLabel(i18n, 'categoryCode')).toBe('Category code');
  });

  it('shows money in its currency, counts grouped, states in words', () => {
    expect(cellText(i18n, 'totalMinor', { totalMinor: 123450, currency: 'USD' })).toBe('$1,234.50');
    expect(cellText(i18n, 'count', { count: 12345 })).toBe('12,345');
    expect(cellText(i18n, 'state', { state: 'confirmed' })).toBe('Confirmed');
    expect(cellText(i18n, 'state', { state: 'on_rent' })).toBe('On rent');
    expect(cellText(i18n, 'state', { state: 'held_for_review' })).toBe('Held for review');
    expect(cellText(i18n, 'error', { error: '' })).toBe('—');
  });

  it('right-aligns only columns that are all numbers', () => {
    const rows = [
      { state: 'a', n: 1 },
      { state: 'b', n: null },
    ];
    expect(isNumericColumn('n', rows)).toBe(true);
    expect(isNumericColumn('state', rows)).toBe(false);
    expect(isNumericColumn('n', [])).toBe(false);
  });

  it('names the scope in the language, with location names', () => {
    const nameOf = (c: string) => (c === 'LHR' ? 'Heathrow' : c);
    expect(scopeText(i18n, 'All locations', nameOf)).toBe('All locations');
    expect(scopeText(i18n, 'Scoped to LHR, CDG', nameOf)).toBe('Only Heathrow, CDG');
    expect(scopeText(i18n, null, nameOf)).toBe('—');
  });

  it('names the download so it can be found again', () => {
    expect(csvName('revenue_by_category', new Date('2026-09-21T10:00:00Z'))).toBe(
      'report-revenue-by-category-2026-09-21.csv',
    );
  });
});

describe('visible columns', () => {
  it('drops internal ids and columns that are empty in every row', () => {
    const rows = [
      { id: 'a', title: 'x', error: '', sample: null },
      { id: 'b', title: 'y', error: '', sample: null },
    ];
    expect(visibleColumns(['id', 'title', 'error', 'sample'], rows)).toEqual(['title']);
  });

  it('keeps every heading when there are no rows', () => {
    expect(visibleColumns(['id', 'title'], [])).toEqual(['id', 'title']);
  });
});

describe('translated report text', () => {
  it('uses the translation of a report or check name, else what the API sent', () => {
    expect(reportTitle(i18n, { code: 'refunds', title: 'Refunds summary' })).toBe('Synthèse');
    expect(reportTitle(i18n, { code: 'new_one', title: 'A new report' })).toBe('A new report');
    expect(
      cellText(i18n, 'title', { id: 'unit_orphan_location', title: 'Vehicles pointing…' }),
    ).toBe('Véhicules orphelins');
    expect(cellText(i18n, 'title', { id: 'other', title: 'As sent' })).toBe('As sent');
  });
});
