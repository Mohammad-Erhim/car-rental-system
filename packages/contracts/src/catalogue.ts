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
  /** a short-lived signed URL resolved server-side from `imageRef` — never persist this, only
   *  the `imageRef` key; null when no image has been uploaded (render the generated fallback art). */
  imageUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  features: z
    .array(z.object({ code: z.string(), label: z.string(), group: z.string() }))
    .default([]),
  version: z.number().int(),
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

/** A selectable vehicle feature (SCREEN-OPS-013/025) — the checklist `zUpsertVehicleCategory`'s
 *  `featureCodes` picks from. Managed on its own (create/deactivate/restore) so the list isn't
 *  fixed to whatever was seeded. */
export const zVehicleFeature = z.object({
  code: z.string(),
  label: z.string(),
  group: z.string(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  version: z.number().int(),
});
export type VehicleFeature = z.infer<typeof zVehicleFeature>;

export const zUpsertVehicleFeature = z.object({
  code: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(120),
  group: z.enum(['comfort', 'safety', 'tech', 'utility']).optional(),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
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
