import { AppError } from '../app-error';

import type { Actor } from './types';

/**
 * FR-RPT-004 / SRS-SEC-007 family — the one place every branch/location-scoped endpoint validates
 * a caller-requested location code against the actor's own permitted locations. An org-wide actor
 * (empty `locationScope`) may request any location code that exists; a location-scoped actor
 * requesting a location outside their own scope gets an explicit 403, never a silent empty
 * result — "you don't have access to this branch" must be visible and actionable, not
 * indistinguishable from "this branch has no data today." Every branch-aware read (dashboard,
 * analytics, reports, reservations, rentals, fleet, search) calls this before touching the
 * database, so the failure mode is identical everywhere in the system.
 *
 * Deliberately separate from `AppError.forbidden()`'s generic message — the caller always knows
 * which code was rejected, so the error names it instead of leaving the operator to guess.
 */
export function assertLocationAccess(actor: Actor, requestedCode?: string | null): void {
  if (!requestedCode) return;
  const scope = actor.locationScope;
  if (scope?.length && !scope.includes(requestedCode)) {
    throw AppError.forbidden(
      `You don't have access to location "${requestedCode}". Your account is scoped to: ${scope.join(', ')}.`,
    );
  }
}

/** Upper bound on a comma-separated location filter (matches the staff `locationScope` cap). */
const MAX_LOCATION_CODES = 50;

/**
 * `?locationCode=LHR,JFK` → `['LHR','JFK']`. The list filters accept one code or several
 * (the dashboard's top-bar filter is multi-select); blanks and duplicates are dropped.
 */
export function parseLocationCodes(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw.flatMap((r) => r.split(',')) : raw.split(',');
  return [...new Set(parts.map((c) => c.trim()).filter(Boolean))].slice(0, MAX_LOCATION_CODES);
}

/**
 * The location codes a list/aggregate query must be restricted to: the caller's requested codes
 * (each validated against the actor's own scope — an out-of-scope code is a 403, never a silently
 * empty result) or, with no request, the actor's own scope. `null` = unrestricted (org-wide actor,
 * nothing requested). This is the one place that turns "what was asked" + "what may be seen" into
 * "what to query", so no service re-derives it.
 */
export function effectiveLocationCodes(
  actor: Actor,
  requested?: string | string[] | null,
): string[] | null {
  const codes = parseLocationCodes(requested);
  for (const code of codes) assertLocationAccess(actor, code);
  if (codes.length) return codes;
  return actor.locationScope?.length ? actor.locationScope : null;
}

/**
 * Record-level guard for a location-scoped staffer. A rental/reservation touches two branches
 * (pickup and return — a one-way hire is handled by both), so the record is inside the scope when
 * EITHER is. `mode` narrows that for actions that only make sense at one end (handing the keys
 * over is the pickup branch's job, taking the car back is the return branch's).
 */
export function assertRecordInScope(
  actor: Actor,
  ends: { pickup?: string | null; return?: string | null },
  message: string,
  mode: 'any' | 'pickup' | 'return' = 'any',
): void {
  const scope = actor.locationScope;
  if (actor.kind !== 'staff' || !scope?.length) return;
  const candidates =
    mode === 'pickup'
      ? [ends.pickup]
      : mode === 'return'
        ? [ends.return]
        : [ends.pickup, ends.return];
  const known = candidates.filter((c): c is string => !!c);
  if (known.length && !known.some((c) => scope.includes(c))) throw AppError.forbidden(message);
}
