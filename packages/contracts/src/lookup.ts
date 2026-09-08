import { z } from 'zod';

import { zId, zInstant } from './primitives';

export const zLookupValue = z.object({
  id: zId,
  typeCode: z.string(),
  code: z.string(),
  scopeKey: z.string(),
  label: z.string(),
  /** locale the label resolved from (for fallback badges) */
  labelLocale: z.string().optional(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  effectiveFrom: zInstant.nullable(),
  effectiveTo: zInstant.nullable(),
  attributes: z.record(z.unknown()),
  systemManaged: z.boolean(),
  version: z.number().int(),
});
export type LookupValue = z.infer<typeof zLookupValue>;

export const zLookupType = z.object({
  code: z.string(),
  classification: z.enum([
    'configurable',
    'constrained',
    'system_fixed',
    'external',
    'entity_owned',
  ]),
  ownerModule: z.string(),
  scopeModel: z.string(),
  editability: z.enum(['editable', 'constrained', 'read_only']),
  lockReason: z.string().nullable(),
  consumerSurfaces: z.array(z.string()),
  description: z.string().nullable(),
  activeValueCount: z.number().int(),
  inactiveValueCount: z.number().int(),
  lastSyncedAt: zInstant.nullable(),
  lastSyncStatus: z.string().nullable(),
});
export type LookupType = z.infer<typeof zLookupType>;

export const zLookupValuesResponse = z.object({
  type: zLookupType,
  values: z.array(zLookupValue),
  /** cache version — echo as If-None-Match / compare to detect staleness */
  etag: z.string(),
});
export type LookupValuesResponse = z.infer<typeof zLookupValuesResponse>;

export const zCreateLookupValueRequest = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscore'),
  scopeKey: z.string().default('global'),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  attributes: z.record(z.unknown()).default({}),
  /** additional locale labels: { fr: '...', ar: '...' } */
  translations: z.record(z.string()).default({}),
});

export const zUpdateLookupValueRequest = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  attributes: z.record(z.unknown()).optional(),
  translations: z.record(z.string()).optional(),
});

export const zLookupUsage = z.object({
  typeCode: z.string(),
  valueCode: z.string(),
  consumers: z.array(z.object({ surface: z.string(), count: z.number().int() })),
  totalReferences: z.number().int(),
  /** false when this lookup type has no mapped consumer column yet (a `0` is not "unused") */
  tracked: z.boolean().optional(),
});
