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
  licenceCountry: z.string().max(2).optional(),
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
  simulateWriteFailure: z.boolean().optional(),
});
export type ConfirmBookingRequest = z.infer<typeof zConfirmBookingRequest>;

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
  subtotalMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  paidMinor: z.number().int(),
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
