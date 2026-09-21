import { createFormatters } from '@carrental/i18n';
import { describe, expect, it } from 'vitest';

import { changeOf, changeText, formatValue, measureLabel, rowLabel } from './report-format';

const texts: Record<string, string> = {
  'ops.rpt.m.net_minor': 'Revenue (ex tax)',
  'ops.rpt.bv.state.no_show': 'No-show',
  'ops.rpt.delta.points': '{n} pts',
  'ops.rpt.unit.hours': '{n} h',
};
const i18n = {
  t: (k: string, p?: Record<string, unknown>) => (texts[k] ?? k).replace('{n}', String(p?.n ?? '')),
  resolvedLocaleFor: (k: string) => (k in texts ? 'en' : null),
  fmt: createFormatters('en'),
};
const kpi = (over: object) => ({
  value: 120,
  previous: 100,
  format: 'count' as const,
  betterWhen: 'up' as const,
  ...over,
});

describe('report figures', () => {
  it('formats money in its currency, shares as percentages, and shows a dash for "cannot say"', () => {
    expect(formatValue(i18n, 'money', 123450, 'USD')).toBe('$1,234.50');
    expect(formatValue(i18n, 'money', 5000, 'JPY')).toBe('¥5,000');
    expect(formatValue(i18n, 'percent', 0.256, null)).toBe('25.6%');
    expect(formatValue(i18n, 'count', 12345, null)).toBe('12,345');
    expect(formatValue(i18n, 'decimal', 2.345, null)).toBe('2.3');
    expect(formatValue(i18n, 'hours', 3.5, null)).toBe('3.5 h');
    expect(formatValue(i18n, 'money', null, 'USD')).toBe('—');
    expect(formatValue(i18n, 'text', 'x', null)).toBe('x');
  });

  it('names a measure in words, or makes the key readable', () => {
    expect(measureLabel(i18n, 'net_minor')).toBe('Revenue (ex tax)');
    expect(measureLabel(i18n, 'something_new_minor')).toBe('Something new');
  });

  it('names a row: the branch or category as the system knows it, states in words', () => {
    expect(rowLabel(i18n, 'category', { key: 'compact', label: 'Compact' })).toBe('Compact');
    expect(rowLabel(i18n, 'location', { key: 'LHR' })).toBe('Lhr');
    expect(rowLabel(i18n, 'state', { key: 'no_show' })).toBe('No-show');
    expect(rowLabel(i18n, 'lead_time', { key: '3_8_14' })).toBe('8 14');
  });

  it('colours a change by whether it is good for the business, not by its direction', () => {
    expect(changeOf(kpi({}))).toMatchObject({ direction: 'up', tone: 'good' });
    expect(changeOf(kpi({ value: 80 }))).toMatchObject({ direction: 'down', tone: 'bad' });
    // a cancellation rate that rises is bad news, one that falls is good
    expect(changeOf(kpi({ betterWhen: 'down' }))).toMatchObject({ direction: 'up', tone: 'bad' });
    expect(changeOf(kpi({ betterWhen: 'down', value: 80 }))).toMatchObject({
      direction: 'down',
      tone: 'good',
    });
    expect(changeOf(kpi({ betterWhen: 'neutral' }))).toMatchObject({ tone: 'neutral' });
    expect(changeOf(kpi({ value: 100 }))).toMatchObject({ direction: 'flat', tone: 'neutral' });
  });

  it('says nothing when there is nothing to compare with', () => {
    expect(changeOf(kpi({ previous: null }))).toBeNull();
    expect(changeOf(kpi({ value: null }))).toBeNull();
    expect(changeOf(kpi({ previous: 0 }))).toBeNull(); // +∞ % is not a number anyone can use
    expect(changeOf(kpi({ previous: 0, value: 0 }))).toMatchObject({ direction: 'flat' });
  });

  it('writes shares in points and everything else in per cent', () => {
    const pct = changeOf(kpi({ format: 'percent', value: 0.3, previous: 0.25 }))!;
    expect(pct.kind).toBe('points');
    expect(changeText(i18n, pct)).toBe('+5 pts');
    expect(changeText(i18n, changeOf(kpi({ value: 80 }))!)).toBe('−20%');
    expect(changeText(i18n, changeOf(kpi({}))!)).toBe('+20%');
  });
});
