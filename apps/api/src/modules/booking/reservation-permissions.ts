/**
 * The staff actions that may reach a reservation through the routes customers also use
 * (`@StaffPermissions`, DEC-038). Each set mirrors what the dashboard already requires of the
 * person and what the matching `/ops` route accepts, so no existing workflow narrows — only a role
 * holding none of them (fleet, config, lookup, …) is now refused.
 */

/** Open a reservation, or its event history (`/ops/reservations` accepts read | modify). */
export const RESERVATION_VIEW = [
  'reservation.read',
  'reservation.modify',
  'reservation.cancel',
] as const;

/** A reservation's invoices — the same set as `GET /ops/reservations/:ref/invoices`. */
export const RESERVATION_INVOICES = [
  'reservation.read',
  'payment.read',
  'payment.reconcile',
] as const;

/** Cancel: the dashboard's Cancel button, and `/ops/.../no-show`, accept cancel | modify. */
export const RESERVATION_CANCEL = ['reservation.cancel', 'reservation.modify'] as const;

export const RESERVATION_MODIFY = ['reservation.modify'] as const;
