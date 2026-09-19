import { describe, expect, it } from 'vitest';

import { findingActions, inTab, needsAction, SAMPLE_LINK } from './dq-model';

import type { DataQualityCheck } from '@/lib/admin-hooks';

const check = (over: Partial<DataQualityCheck>): DataQualityCheck =>
  ({ id: 'c', ok: false, error: null, findingState: 'open', ...over }) as DataQualityCheck;

describe('dq-model', () => {
  it('offers all three actions on an open finding, two once acknowledged', () => {
    expect(findingActions(check({}))).toEqual(['acknowledge', 'resolve', 'falsePositive']);
    expect(findingActions(check({ findingState: 'acknowledged' }))).toEqual([
      'resolve',
      'falsePositive',
    ]);
  });

  it('offers nothing for clear, resolved, false-positive or failed checks', () => {
    expect(findingActions(check({ ok: true, findingState: 'clear' }))).toEqual([]);
    expect(findingActions(check({ findingState: 'resolved' }))).toEqual([]);
    expect(findingActions(check({ findingState: 'false_positive' }))).toEqual([]);
    expect(findingActions(check({ error: 'boom' }))).toEqual([]);
  });

  it('splits checks into issues and clear', () => {
    expect(inTab(check({}), 'issues')).toBe(true);
    expect(inTab(check({ ok: true }), 'issues')).toBe(false);
    expect(inTab(check({ ok: true }), 'clear')).toBe(true);
    expect(inTab(check({}), 'all')).toBe(true);
  });

  it('only open findings need action', () => {
    expect(needsAction(check({}))).toBe(true);
    expect(needsAction(check({ findingState: 'acknowledged' }))).toBe(false);
  });

  it('links sample keys to router paths', () => {
    expect(SAMPLE_LINK.reservation_orphan_account!('RES-1')).toBe('/work/RES-1');
    expect(SAMPLE_LINK.rental_active_without_unit!('RNT-1')).toBe('/rentals/RNT-1');
  });
});
