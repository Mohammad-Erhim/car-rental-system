import { describe, expect, it } from 'vitest';

import {
  computeAvailability,
  isUnitFree,
  overlaps,
  pickFreeUnit,
  type Interval,
} from './availability.engine';

const H = 3_600_000;
const t = (day: number, hour = 10) => Date.UTC(2026, 0, day, hour); // Jan 2026
const win = (fromDay: number, toDay: number, hour = 10): Interval => ({
  start: t(fromDay, hour),
  end: t(toDay, hour),
});

describe('overlaps (half-open)', () => {
  it('touching intervals do not overlap', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });
  it('nested and partial overlaps are detected', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 7 })).toBe(true);
    expect(overlaps({ start: 5, end: 15 }, { start: 0, end: 10 })).toBe(true);
  });
});

describe('isUnitFree with turnaround', () => {
  const request = win(10, 13); // Jan 10 → Jan 13

  it('free when there is no occupied interval', () => {
    expect(isUnitFree(request, undefined, H)).toBe(true);
    expect(isUnitFree(request, [], H)).toBe(true);
  });

  it('free when an earlier rental ends more than turnaround before pickup', () => {
    const prev = { start: t(7), end: t(9) }; // ends Jan 9 10:00, pickup Jan 10 10:00 (24h gap)
    expect(isUnitFree(request, [prev], H)).toBe(true);
  });

  it('NOT free when an earlier rental ends inside the turnaround buffer', () => {
    // ends Jan 10 09:30 → padded end Jan 10 10:30 → overlaps a 10:00 pickup
    const prev = { start: t(8), end: Date.UTC(2026, 0, 10, 9, 30) };
    expect(isUnitFree(request, [prev], H)).toBe(false);
  });

  it('NOT free when a later rental starts inside the trailing turnaround buffer', () => {
    const next = { start: Date.UTC(2026, 0, 13, 10, 30), end: t(16) }; // 30min after return
    expect(isUnitFree(request, [next], H)).toBe(false);
  });

  it('free when a later rental starts more than turnaround after return', () => {
    const next = { start: t(14), end: t(16) }; // 24h after return
    expect(isUnitFree(request, [next], H)).toBe(true);
  });

  it('NOT free for a directly overlapping rental regardless of turnaround', () => {
    expect(isUnitFree(request, [win(11, 12)], 0)).toBe(false);
  });
});

describe('computeAvailability', () => {
  const request = win(10, 13);

  it('counts every unit free when nothing is occupied', () => {
    const r = computeAvailability({
      request,
      turnaroundMs: H,
      unitIds: ['u1', 'u2', 'u3'],
      occupiedByUnit: {},
      classHolds: 0,
    });
    expect(r.totalUnits).toBe(3);
    expect(r.freeUnitIds).toEqual(['u1', 'u2', 'u3']);
    expect(r.bookableCount).toBe(3);
  });

  it('subtracts units with an overlapping rental (+ turnaround) and class holds', () => {
    const r = computeAvailability({
      request,
      turnaroundMs: H,
      unitIds: ['u1', 'u2', 'u3', 'u4'],
      occupiedByUnit: {
        u1: [win(11, 12)], // overlaps
        u2: [{ start: Date.UTC(2026, 0, 13, 10, 30), end: t(15) }], // starts in trailing buffer
        u3: [win(1, 3)], // long gone
      },
      classHolds: 1,
    });
    expect(r.freeUnitIds.sort()).toEqual(['u3', 'u4']);
    expect(r.bookableCount).toBe(1); // 2 free - 1 class hold
  });

  it('never returns a negative bookable count', () => {
    const r = computeAvailability({
      request,
      turnaroundMs: H,
      unitIds: ['u1'],
      occupiedByUnit: {},
      classHolds: 5,
    });
    expect(r.bookableCount).toBe(0);
  });

  it('treats an invalid (non-positive) window as zero availability', () => {
    const r = computeAvailability({
      request: { start: t(13), end: t(10) },
      turnaroundMs: H,
      unitIds: ['u1', 'u2'],
      occupiedByUnit: {},
      classHolds: 0,
    });
    expect(r.bookableCount).toBe(0);
    expect(r.freeUnitIds).toEqual([]);
  });

  it('open-ended maintenance block (very large end) removes the unit', () => {
    const r = computeAvailability({
      request,
      turnaroundMs: 0,
      unitIds: ['u1', 'u2'],
      occupiedByUnit: { u1: [{ start: t(1), end: t(365) }] },
      classHolds: 0,
    });
    expect(r.freeUnitIds).toEqual(['u2']);
  });
});

describe('pickFreeUnit', () => {
  const request = win(10, 13);
  it('returns the first candidate with no fresh conflict', () => {
    const picked = pickFreeUnit(
      request,
      ['u1', 'u2', 'u3'],
      { u1: [win(11, 12)], u2: [win(1, 2)] },
      H,
    );
    expect(picked).toBe('u2');
  });
  it('returns null when every candidate was just taken', () => {
    expect(pickFreeUnit(request, ['u1'], { u1: [win(10, 13)] }, 0)).toBeNull();
  });
});
