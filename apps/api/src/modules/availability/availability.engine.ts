/**
 * Pure availability arithmetic (FR-CAT-005 / SRS-AVL-*). No DB, no time source — every input is
 * passed in so the rules are exhaustively testable. The service layer gathers the inputs
 * (units at/through the location in a bookable state, their occupied intervals from rentals +
 * reservations + blocks, and class-level holds) and calls `computeAvailability`.
 *
 * All instants are epoch milliseconds. Two half-open intervals [s,e) overlap iff s1 < e2 && s2 < e1.
 */

export interface Interval {
  /** epoch ms, inclusive start */
  start: number;
  /** epoch ms, exclusive end */
  end: number;
}

export interface AvailabilityInputs {
  /** the requested pickup..return window (already hours-validated by the caller) */
  request: Interval;
  /** buffer (ms) a unit needs free on each side of an occupied interval before it can be re-let */
  turnaroundMs: number;
  /** candidate unit ids: right category, currently at/through the pickup location, bookable state */
  unitIds: string[];
  /** unitId -> its occupied intervals (confirmed rentals, held reservations, maintenance/blocks) */
  occupiedByUnit: Record<string, Interval[]>;
  /**
   * count of live class-level holds (not pinned to a unit) whose window overlaps the request —
   * these consume capacity from the free pool.
   */
  classHolds: number;
}

export interface AvailabilityResult {
  totalUnits: number;
  /** units with no turnaround-padded conflict against the request window */
  freeUnitIds: string[];
  /** what a new booking can actually take: max(0, free - classHolds) */
  bookableCount: number;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Pad an occupied interval by the turnaround buffer on both sides. */
function pad(iv: Interval, turnaroundMs: number): Interval {
  return { start: iv.start - turnaroundMs, end: iv.end + turnaroundMs };
}

export function isUnitFree(
  request: Interval,
  occupied: Interval[] | undefined,
  turnaroundMs: number,
): boolean {
  if (!occupied || occupied.length === 0) return true;
  for (const iv of occupied) {
    if (overlaps(request, pad(iv, turnaroundMs))) return false;
  }
  return true;
}

export function computeAvailability(input: AvailabilityInputs): AvailabilityResult {
  const { request, turnaroundMs, unitIds, occupiedByUnit, classHolds } = input;
  if (!(request.start < request.end)) {
    return { totalUnits: unitIds.length, freeUnitIds: [], bookableCount: 0 };
  }
  const freeUnitIds = unitIds.filter((id) =>
    isUnitFree(request, occupiedByUnit[id], Math.max(0, turnaroundMs)),
  );
  const bookableCount = Math.max(0, freeUnitIds.length - Math.max(0, classHolds));
  return { totalUnits: unitIds.length, freeUnitIds, bookableCount };
}
