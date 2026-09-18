import { describe, expect, it } from 'vitest';

import {
  clean,
  inCoordinateRange,
  LOCATION_CODE,
  mergeHours,
  opensBeforeCloses,
  toSlots,
  validTurnaround,
} from './location-model';

describe('location-model', () => {
  it('fills the whole week, closing days the API has no slot for', () => {
    const week = mergeHours([{ day: 1, open: '08:00', close: '18:00' }]);
    expect(week).toHaveLength(7);
    expect(week[1]).toMatchObject({ closed: false, open: '08:00', close: '18:00' });
    expect(week[0]!.closed).toBe(true);
  });

  it('sends closed days without times', () => {
    const slots = toSlots([
      { day: 0, closed: true, open: '09:00', close: '17:00' },
      { day: 1, closed: false, open: '09:00', close: '17:00' },
    ]);
    expect(slots[0]).toEqual({ day: 0, closed: true });
    expect(slots[1]).toEqual({ day: 1, open: '09:00', close: '17:00' });
  });

  it('requires opening before closing', () => {
    expect(opensBeforeCloses('09:00', '17:00')).toBe(true);
    expect(opensBeforeCloses('17:00', '09:00')).toBe(false);
    expect(opensBeforeCloses('', '09:00')).toBe(false);
  });

  it('validates codes, coordinates and turnaround', () => {
    expect(LOCATION_CODE.test('LHR1')).toBe(true);
    expect(LOCATION_CODE.test('lhr')).toBe(false);
    expect(inCoordinateRange('', 90)).toBe(true);
    expect(inCoordinateRange('91', 90)).toBe(false);
    expect(inCoordinateRange('abc', 90)).toBe(false);
    expect(validTurnaround('60')).toBe(true);
    expect(validTurnaround('1441')).toBe(false);
    expect(validTurnaround('')).toBe(false);
  });

  it('drops blank address parts', () => {
    expect(clean({ a: ' x ', b: '  ' })).toEqual({ a: 'x' });
  });
});
