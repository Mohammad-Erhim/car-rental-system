/**
 * Pure quote arithmetic (FR-PRC-002..005 / SRS-PRC-*). Money is integer minor units end to end.
 * The invariant enforced and tested here: the sum of the line `amountMinor` equals `totalMinor`,
 * and `subtotalMinor + taxMinor === totalMinor`. Tax is rounded once (half-up); the total is
 * never re-rounded.
 */

export interface RatePlanInput {
  id: string;
  version: number;
  currency: string;
  baseDayMinor: number;
  hourMinor: number;
  minDurationHours: number;
  maxDurationHours: number | null;
  fees: Array<{ code: string; label: string; amountMinor: number; taxable?: boolean }>;
  taxBps: number;
}

export interface RateTierInput {
  minHours: number;
  dayMinor: number;
}

export interface QuoteLineOut {
  kind: 'time' | 'fee' | 'surcharge' | 'discount' | 'tax';
  code: string;
  label: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
  taxable: boolean;
  sortOrder: number;
}

export interface QuoteComputation {
  durationHours: number;
  fullDays: number;
  remainderHours: number;
  perDayMinor: number;
  lines: QuoteLineOut[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export type QuoteError =
  | { ok: false; reason: 'below_min_duration'; minDurationHours: number }
  | { ok: false; reason: 'above_max_duration'; maxDurationHours: number }
  | { ok: false; reason: 'invalid_window' };

export function durationHoursBetween(pickupMs: number, returnMs: number): number {
  return Math.ceil((returnMs - pickupMs) / 3_600_000);
}

/** Highest tier whose `minHours` ≤ duration; falls back to the plan base day rate. */
export function perDayRate(
  baseDayMinor: number,
  tiers: RateTierInput[],
  durationHours: number,
): number {
  let rate = baseDayMinor;
  let bestMin = -1;
  for (const tier of tiers) {
    if (tier.minHours <= durationHours && tier.minHours > bestMin) {
      bestMin = tier.minHours;
      rate = tier.dayMinor;
    }
  }
  return rate;
}

function roundHalfUp(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

export function computeQuote(
  pickupMs: number,
  returnMs: number,
  plan: RatePlanInput,
  tiers: RateTierInput[] = [],
): QuoteComputation | QuoteError {
  if (!(pickupMs < returnMs)) return { ok: false, reason: 'invalid_window' };
  const durationHours = durationHoursBetween(pickupMs, returnMs);
  if (durationHours < plan.minDurationHours) {
    return { ok: false, reason: 'below_min_duration', minDurationHours: plan.minDurationHours };
  }
  if (plan.maxDurationHours != null && durationHours > plan.maxDurationHours) {
    return { ok: false, reason: 'above_max_duration', maxDurationHours: plan.maxDurationHours };
  }

  const fullDays = Math.floor(durationHours / 24);
  const remainderHours = durationHours - fullDays * 24;
  const perDayMinor = perDayRate(plan.baseDayMinor, tiers, durationHours);

  const lines: QuoteLineOut[] = [];
  let sort = 0;

  if (fullDays > 0) {
    lines.push({
      kind: 'time',
      code: 'rental_days',
      label: `Rental — ${fullDays} day${fullDays === 1 ? '' : 's'}`,
      quantity: fullDays,
      unitMinor: perDayMinor,
      amountMinor: fullDays * perDayMinor,
      taxable: true,
      sortOrder: sort++,
    });
  }
  if (remainderHours > 0) {
    // a partial trailing day is billed hourly but never more than one extra day
    const rawHourly = remainderHours * plan.hourMinor;
    const amount = Math.min(rawHourly, perDayMinor);
    lines.push({
      kind: 'time',
      code: 'rental_hours',
      label: `Rental — ${remainderHours} hour${remainderHours === 1 ? '' : 's'}`,
      quantity: remainderHours,
      unitMinor: plan.hourMinor,
      amountMinor: amount,
      taxable: true,
      sortOrder: sort++,
    });
  }
  // ensure at least one time line even for a sub-24h rental with hourMinor 0
  if (lines.length === 0) {
    lines.push({
      kind: 'time',
      code: 'rental_days',
      label: 'Rental — 1 day',
      quantity: 1,
      unitMinor: perDayMinor,
      amountMinor: perDayMinor,
      taxable: true,
      sortOrder: sort++,
    });
  }

  for (const fee of plan.fees) {
    lines.push({
      kind: 'fee',
      code: fee.code,
      label: fee.label,
      quantity: 1,
      unitMinor: fee.amountMinor,
      amountMinor: fee.amountMinor,
      taxable: fee.taxable ?? true,
      sortOrder: sort++,
    });
  }

  const subtotalMinor = lines.reduce((a, l) => a + l.amountMinor, 0);
  const taxableBase = lines.filter((l) => l.taxable).reduce((a, l) => a + l.amountMinor, 0);
  const taxMinor = plan.taxBps > 0 ? roundHalfUp((taxableBase * plan.taxBps) / 10_000) : 0;

  if (taxMinor > 0) {
    lines.push({
      kind: 'tax',
      code: 'tax',
      label: `Tax (${(plan.taxBps / 100).toFixed(plan.taxBps % 100 === 0 ? 0 : 2)}%)`,
      quantity: 1,
      unitMinor: taxMinor,
      amountMinor: taxMinor,
      taxable: false,
      sortOrder: sort++,
    });
  }

  const totalMinor = subtotalMinor + taxMinor;
  return {
    durationHours,
    fullDays,
    remainderHours,
    perDayMinor,
    lines,
    subtotalMinor,
    taxMinor,
    totalMinor,
  };
}

export function isQuoteError(r: QuoteComputation | QuoteError): r is QuoteError {
  return (r as QuoteError).ok === false;
}
