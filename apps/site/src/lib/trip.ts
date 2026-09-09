'use client';

/**
 * The "trip the visitor is planning" — pickup location + window. Persisted so the browse journey
 * and the book journey stay connected: once someone has searched (or filled the picker on a
 * vehicle page) every other vehicle page can price itself immediately instead of dead-ending on
 * "start a search first". The URL query is still the source of truth when present (shareable,
 * refresh-safe); this is the fallback.
 */
export interface TripWindow {
  /** pickup location code, uppercase */
  pickup: string;
  /** ISO 8601 */
  pickupAt: string;
  /** ISO 8601 */
  returnAt: string;
}

const KEY = 'carrental.trip';

export function isCompleteTrip(t: Partial<TripWindow> | null | undefined): t is TripWindow {
  return !!(t && t.pickup && t.pickupAt && t.returnAt);
}

/** Last trip the visitor planned, or null — drops a window whose pickup has already passed. */
export function readTrip(): TripWindow | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<TripWindow>;
    if (!isCompleteTrip(t)) return null;
    const pickupTime = new Date(t.pickupAt).getTime();
    if (Number.isNaN(pickupTime) || pickupTime < Date.now()) return null;
    return t;
  } catch {
    return null;
  }
}

export function writeTrip(t: TripWindow): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* private mode / disabled storage — the URL still carries the window */
  }
}

/** A sensible default window when the visitor has none: pickup in 3 days at noon, 3-day rental. */
export function defaultWindow(): { pickupAt: string; returnAt: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 12);
  const end = new Date(start.getTime() + 3 * 864e5);
  return { pickupAt: start.toISOString(), returnAt: end.toISOString() };
}
