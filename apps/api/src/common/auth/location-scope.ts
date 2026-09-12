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
