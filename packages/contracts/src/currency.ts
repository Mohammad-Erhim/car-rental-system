import { z } from 'zod';

/**
 * Currencies an operator has enabled (Settings → Currencies, DEC-036). Storage is the `currency`
 * reference-data list; these shapes are what the two dedicated endpoints exchange.
 */

/** ISO-4217 alphabetic code, normalised to upper case. */
export const zCurrencyCode = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/)
  .transform((s) => s.toUpperCase());

/** `POST /ops/config/currencies` — enable a catalogue currency (or re-enable a disabled one). */
export const zEnableCurrencyRequest = z.object({
  code: zCurrencyCode,
  makeDefault: z.boolean().optional(),
});
export type EnableCurrencyRequest = z.infer<typeof zEnableCurrencyRequest>;

/** One currency in the operator's list, with what depends on it. */
export const zAdminCurrency = z.object({
  id: z.string(),
  code: z.string(),
  /** localised name in the caller's locale, English as the fallback */
  label: z.string(),
  digits: z.number().int(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  version: z.number().int(),
  /** live price lists and active extras priced in it — what disabling would strand */
  usage: z.object({
    ratePlans: z.number().int(),
    products: z.number().int(),
  }),
});
export type AdminCurrency = z.infer<typeof zAdminCurrency>;

export const zAdminCurrenciesResponse = z.object({
  defaultCode: z.string(),
  currencies: z.array(zAdminCurrency),
  /** catalogue currencies not yet enabled — what the "add currency" picker offers */
  available: z.array(z.object({ code: z.string(), name: z.string(), digits: z.number().int() })),
});
export type AdminCurrenciesResponse = z.infer<typeof zAdminCurrenciesResponse>;

/** `GET /discovery/currencies` — what the customer's currency switcher offers. */
export const zPublicCurrency = z.object({
  code: z.string(),
  label: z.string(),
  digits: z.number().int(),
  isDefault: z.boolean(),
});
export type PublicCurrency = z.infer<typeof zPublicCurrency>;

export const zPublicCurrenciesResponse = z.object({
  defaultCode: z.string(),
  currencies: z.array(zPublicCurrency),
});
export type PublicCurrenciesResponse = z.infer<typeof zPublicCurrenciesResponse>;
