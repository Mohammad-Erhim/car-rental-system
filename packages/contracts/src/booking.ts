import { z } from 'zod';

import { zInstant } from './primitives';

export const zDriverInput = z.object({
  role: z.enum(['primary_renter', 'additional', 'payer']).optional(),
  savedDriverId: z.string().uuid().optional(),
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  licenceNumber: z.string().max(80).optional(),
  // ISO-3166 alpha-2, normalized like `zMoney.currency` (primitives.ts) does for ISO-4217.
  licenceCountry: z.string().length(2).toUpperCase().optional(),
  licenceExpiresOn: z.string().optional(),
});

export const zConfirmBookingRequest = z.object({
  quoteReference: z.string().min(3).max(40),
  drivers: z.array(zDriverInput).min(1).max(6),
  /**
   * Selected extras / protection products, by catalogue code only. The server resolves each
   * code to an active, applicable product version and prices it — the client never supplies a
   * price or label (S7-DEF-004). No product catalogue exists yet, so any non-empty value is
   * currently rejected; see S7-GAP-EXTRAS / FR-ADM-006.
   */
  extraCodes: z.array(z.string().min(1).max(60)).max(20).optional(),
  acceptTerms: z.literal(true),
  paymentToken: z.string().min(3).max(200),
  holderKey: z.string().max(120).optional(),
});
export type ConfirmBookingRequest = z.infer<typeof zConfirmBookingRequest>;

/**
 * `zConfirmBookingRequest` plus the one server-side fault-injection debug hook
 * (`simulateWriteFailure`, exercised by the integration suite — see
 * `apps/api/test/booking.spec.ts` TEST-ERR-004, `reservation-ops.spec.ts`, `report.spec.ts`).
 * Kept out of the public `ConfirmBookingRequest` contract type (what client apps import and
 * what any future OpenAPI consumer would see) so the always-public "confirm booking" schema
 * doesn't itself advertise "this system has a debug write-failure switch" — even though the
 * switch is already a no-op outside non-production (`booking.service.ts`'s
 * `this.env.NODE_ENV !== 'production'` gate). Only `booking.controller.ts` parses the request
 * body against this variant; every other caller of `zConfirmBookingRequest` gets the plain one.
 */
export const zConfirmBookingRequestDebug = zConfirmBookingRequest.extend({
  simulateWriteFailure: z.boolean().optional(),
});
export type ConfirmBookingRequestDebug = z.infer<typeof zConfirmBookingRequestDebug>;

export const zReservationLine = z.object({
  kind: z.string(),
  code: z.string(),
  label: z.string(),
  quantity: z.number().int(),
  unitMinor: z.number().int(),
  amountMinor: z.number().int(),
});

export const zReservation = z.object({
  reference: z.string(),
  state: z.string(),
  categoryCode: z.string(),
  pickupLocationCode: z.string(),
  returnLocationCode: z.string(),
  pickupAt: zInstant,
  returnAt: zInstant,
  durationHours: z.number().int(),
  currency: z.string(),
  subtotalMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  paidMinor: z.number().int().nonnegative(),
  channel: z.string(),
  confirmedAt: zInstant.nullable(),
  lines: z.array(zReservationLine),
  drivers: z.array(
    z.object({
      role: z.string(),
      fullName: z.string(),
      licenceNumber: z.string().nullable(),
      email: z.string().nullable(),
    }),
  ),
  termsAccepted: z.object({ version: z.string(), acceptedAt: zInstant }).nullable(),
  /** SCREEN-CUS-003b — the specific car picked before checkout, if any (never plate/VIN here —
   *  those are staff-only, surfaced separately on the ops reservation detail). */
  pickedUnit: z
    .object({
      id: z.string(),
      make: z.string().nullable(),
      model: z.string().nullable(),
      colour: z.string().nullable(),
    })
    .nullable(),
});
export type Reservation = z.infer<typeof zReservation>;

export const zConfirmBookingResponse = zReservation.extend({
  guestAccessToken: z.string().nullable(),
  payment: z.object({
    brand: z.string().nullable(),
    last4: z.string().nullable(),
    alreadyProcessed: z.boolean(),
  }),
  heldUnitPinned: z.boolean(),
});

export const zClaimGuestRequest = z.object({
  reference: z.string().min(3).max(40),
  token: z.string().min(10).max(200),
});
