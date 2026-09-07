import { z } from 'zod';

/** Opaque stable identifier (SRS-DAT-002). We use UUID v4/v7 strings. */
export const zId = z.string().uuid();
export type Id = z.infer<typeof zId>;

/** ISO-8601 instant in UTC (SRS-DAT-004). */
export const zInstant = z.string().datetime({ offset: true });

/** IANA time-zone id, e.g. "America/New_York" (SRS-DAT-004). */
export const zTimeZone = z.string().min(1);

/** BCP-47 locale code — language-neutral, never localized (SRS-I18N-004). */
export const zLocale = z.string().min(2).max(35);

/**
 * Money as integer minor units + ISO-4217 currency (SRS-DAT-003).
 * Floating point is never used for accepted financial values.
 */
export const zMoney = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3).toUpperCase(),
});
export type Money = z.infer<typeof zMoney>;

/** Optimistic-concurrency version carried on mutable aggregates (SRS-DAT-002, SRS-API-007). */
export const zVersion = z.number().int().nonnegative();

/** Cursor pagination envelope (SRS-API-005). */
export const zPageInfo = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type PageInfo = z.infer<typeof zPageInfo>;

export function zPage<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), page: zPageInfo });
}

export const zCursorQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorQuery = z.infer<typeof zCursorQuery>;

/** A localized label carried with its stable code (SRS-LKP-003/013). */
export const zLocalizedRef = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  /** locale the label resolved from, for fallback badges */
  labelLocale: zLocale.optional(),
});
export type LocalizedRef = z.infer<typeof zLocalizedRef>;
