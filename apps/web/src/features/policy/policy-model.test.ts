import { describe, expect, it } from 'vitest';

import { checkField, POLICY_KEYS, previewSentences, startValues } from './policy-model';

describe('policy-model', () => {
  it('treats blank as missing, not zero', () => {
    expect(checkField('freeCancelHours', '')).toBe('required');
    expect(checkField('freeCancelHours', '0')).toBeNull();
  });

  it('rejects non-integers and values past the bound', () => {
    expect(checkField('lateFeeBps', '12.5')).toBe('invalid');
    expect(checkField('lateFeeBps', '-1')).toBe('invalid');
    expect(checkField('lateFeeBps', '10001')).toBe('range');
    expect(checkField('lateFeeBps', '10000')).toBeNull();
  });

  it('starts from a revision or blank', () => {
    const key = POLICY_KEYS[0]!;
    expect(startValues(key)).toEqual({ freeCancelHours: '', lateFeeBps: '' });
    expect(
      startValues(key, { payload: { freeCancelHours: 48, lateFeeBps: 2000 } } as never),
    ).toEqual({ freeCancelHours: '48', lateFeeBps: '2000' });
  });

  it('picks the sentences for the previewed setting', () => {
    const base = { currency: 'USD' } as never;
    expect(previewSentences({ ...(base as object), key: 'fuel_rate' } as never)).toEqual(['fuel']);
    expect(previewSentences({ ...(base as object), key: 'cancellation' } as never)).toEqual([
      'cancelFee',
      'cancelFree',
    ]);
  });
});
