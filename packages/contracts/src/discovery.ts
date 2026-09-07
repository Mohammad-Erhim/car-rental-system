import { z } from 'zod';

import { zId, zInstant } from './primitives';

/** Search request (SCREEN-CUS-001 / FLOW-CUS-001). Instants are ISO-8601 with offset. */
export const zAvailabilitySearchRequest = z.object({
  pickupLocationCode: z.string().min(2).max(20),
  returnLocationCode: z.string().min(2).max(20).optional(),
  pickupAt: zInstant,
  returnAt: zInstant,
  categoryCode: z.string().max(40).optional(),
});
export type AvailabilitySearchRequest = z.infer<typeof zAvailabilitySearchRequest>;

export const zAvailabilityOption = z.object({
  categoryCode: z.string(),
  categoryName: z.string(),
  class: z.string(),
  transmission: z.string(),
  passengers: z.number().int(),
  luggage: z.number().int(),
  imageRef: z.string().nullable(),
  features: z.array(z.object({ code: z.string(), label: z.string() })).default([]),
  bookableCount: z.number().int(),
  /** cheapest total for the requested window, minor units; null if no rate plan applies */
  fromTotalMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
});

export const zAvailabilitySearchResponse = z.object({
  pickupLocationCode: z.string(),
  returnLocationCode: z.string(),
  pickupAt: zInstant,
  returnAt: zInstant,
  durationHours: z.number().int(),
  /** SRS-UI freshness: 'fresh' now, 'stale' if the client window changed since, 'no_results' */
  state: z.enum(['fresh', 'no_results']),
  options: z.array(zAvailabilityOption),
  /** hours/validation problems that suppressed a result, if any */
  notices: z
    .array(z.object({ code: z.string(), message: z.string(), field: z.string().optional() }))
    .default([]),
});
export type AvailabilitySearchResponse = z.infer<typeof zAvailabilitySearchResponse>;

/** Quote (SCREEN-CUS-003 → checkout). */
export const zQuoteLine = z.object({
  kind: z.enum(['time', 'fee', 'surcharge', 'discount', 'tax']),
  code: z.string(),
  label: z.string(),
  quantity: z.number().int(),
  unitMinor: z.number().int(),
  amountMinor: z.number().int(),
});

export const zQuote = z.object({
  reference: z.string(),
  version: z.number().int(),
  status: z.enum(['active', 'superseded', 'expired', 'consumed']),
  categoryCode: z.string(),
  pickupLocationCode: z.string(),
  returnLocationCode: z.string(),
  pickupAt: zInstant,
  returnAt: zInstant,
  durationHours: z.number().int(),
  currency: z.string(),
  lines: z.array(zQuoteLine),
  subtotalMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  expiresAt: zInstant,
  hold: z
    .object({ id: zId, expiresAt: zInstant, unitPinned: z.boolean() })
    .nullable()
    .default(null),
});
export type Quote = z.infer<typeof zQuote>;

export const zCreateQuoteRequest = zAvailabilitySearchRequest
  .extend({ categoryCode: z.string().min(2).max(40) })
  .extend({ hold: z.boolean().default(true), holderKey: z.string().max(120).optional() });
