import { z } from 'zod';

import { zId } from './primitives';

/** Vehicle category card (SCREEN-CUS-002) + management shape (SCREEN-OPS-013/025). */
export const zVehicleCategory = z.object({
  id: zId,
  code: z.string(),
  class: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  passengers: z.number().int(),
  luggage: z.number().int(),
  doors: z.number().int(),
  transmission: z.enum(['automatic', 'manual']),
  imageRef: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  features: z
    .array(z.object({ code: z.string(), label: z.string(), group: z.string() }))
    .default([]),
});
export type VehicleCategory = z.infer<typeof zVehicleCategory>;

export const zUpsertVehicleCategory = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  class: z.string().min(2).max(40),
  displayName: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  passengers: z.number().int().min(1).max(60),
  luggage: z.number().int().min(0).max(30),
  doors: z.number().int().min(2).max(8),
  transmission: z.enum(['automatic', 'manual']).default('automatic'),
  imageRef: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  featureCodes: z.array(z.string().max(60)).max(40).optional(),
});

/** Fleet inventory row (SCREEN-OPS-013, read this stage). */
export const zVehicleUnit = z.object({
  id: zId,
  categoryCode: z.string(),
  categoryName: z.string(),
  currentLocationCode: z.string(),
  homeLocationCode: z.string(),
  vin: z.string(),
  plate: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.string().nullable(),
  colour: z.string().nullable(),
  state: z.string(),
});
export type VehicleUnit = z.infer<typeof zVehicleUnit>;
