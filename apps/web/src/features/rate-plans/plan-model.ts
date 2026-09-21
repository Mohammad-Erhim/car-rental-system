import { minorToDecimalString, parseDecimalToMinor } from '@carrental/i18n';

import type { RatePlan, RatePlanInput } from '@/lib/ops-discovery-hooks';

/** Form-side shape: everything is a string so inputs stay controlled and money never loses digits. */
export interface FeeValues {
  code: string;
  label: string;
  amount: string;
  taxable: boolean;
}
export interface TierValues {
  minHours: string;
  day: string;
}
export interface PlanValues {
  categoryCode: string;
  name: string;
  /** '' = all locations, else a location code */
  scope: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  baseDay: string;
  hour: string;
  taxPct: string;
  minDuration: string;
  maxDuration: string;
  fees: FeeValues[];
  tiers: TierValues[];
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
/** What was typed → integer minor units, by the plan's own currency (¥ has no cents). */
export const toMinor = (s: string, currency: string) => parseDecimalToMinor(s, currency) ?? 0;
export const fromMinor = (m: number, currency: string) => minorToDecimalString(m, currency);

/**
 * Money fields typed with more decimals than the plan's currency has (12.505 USD, 12.5 JPY) —
 * refused instead of silently rounded. Returned as form paths so each error lands on its field.
 */
export function overPreciseFields(
  v: Pick<PlanValues, 'currency' | 'baseDay' | 'hour' | 'fees' | 'tiers'>,
): Array<Array<string | number>> {
  const bad = (s: string) => s.trim() !== '' && parseDecimalToMinor(s, v.currency) === null;
  const out: Array<Array<string | number>> = [];
  if (bad(v.baseDay)) out.push(['baseDay']);
  if (bad(v.hour)) out.push(['hour']);
  v.fees.forEach((f, i) => bad(f.amount) && out.push(['fees', i, 'amount']));
  v.tiers.forEach((t, i) => bad(t.day) && out.push(['tiers', i, 'day']));
  return out;
}

export const emptyPlanValues = (): PlanValues => ({
  categoryCode: '',
  name: '',
  scope: '',
  // empty: the currency picker fills in the business's default currency once it has loaded
  currency: '',
  effectiveFrom: todayIso(),
  effectiveTo: '',
  baseDay: '',
  hour: '',
  taxPct: '20',
  minDuration: '24',
  maxDuration: '',
  fees: [],
  tiers: [],
});

export function planToValues(p: RatePlan): PlanValues {
  return {
    categoryCode: p.categoryCode,
    name: p.name,
    scope: p.locationCode ?? '',
    currency: p.currency,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo ?? '',
    baseDay: fromMinor(p.baseDayMinor, p.currency),
    hour: p.hourMinor ? fromMinor(p.hourMinor, p.currency) : '',
    taxPct: String(p.taxBps / 100),
    minDuration: String(p.minDurationHours),
    maxDuration: p.maxDurationHours == null ? '' : String(p.maxDurationHours),
    fees: p.fees.map((f) => ({
      code: f.code,
      label: f.label,
      amount: fromMinor(f.amountMinor, p.currency),
      taxable: f.taxable ?? true,
    })),
    tiers: p.tiers.map((t) => ({
      minHours: String(t.minHours),
      day: fromMinor(t.dayMinor, p.currency),
    })),
  };
}

/** A published/retired plan copied into a fresh draft: same terms, new start date, no end. */
export function cloneValues(p: RatePlan): PlanValues {
  return { ...planToValues(p), effectiveFrom: todayIso(), effectiveTo: '' };
}

/** Form values → the API body. */
export function valuesToInput(v: PlanValues, id?: string): RatePlanInput {
  return {
    id,
    categoryCode: v.categoryCode,
    name: v.name.trim(),
    locationCode: v.scope || null,
    currency: v.currency,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo || null,
    baseDayMinor: toMinor(v.baseDay, v.currency),
    hourMinor: v.hour.trim() ? toMinor(v.hour, v.currency) : 0,
    minDurationHours: Math.round(Number(v.minDuration)),
    maxDurationHours: v.maxDuration.trim() ? Math.round(Number(v.maxDuration)) : null,
    taxBps: Math.round(Number(v.taxPct) * 100),
    fees: v.fees.map((f) => ({
      code: f.code.trim(),
      label: f.label.trim(),
      amountMinor: toMinor(f.amount, v.currency),
      taxable: f.taxable,
    })),
    tiers: v.tiers.map((t) => ({
      minHours: Math.round(Number(t.minHours)),
      dayMinor: toMinor(t.day, v.currency),
    })),
  };
}

export const isEditable = (status: RatePlan['status']) =>
  status === 'draft' || status === 'in_review';

/** Published plans that publishing `plan` would supersede (same category + scope + currency,
 *  overlapping dates) — a price list in another currency runs alongside, never replaced. */
export function wouldReplace(plan: RatePlan, all: RatePlan[]): RatePlan[] {
  const FAR = '9999-12-31';
  return all.filter(
    (o) =>
      o.id !== plan.id &&
      o.status === 'published' &&
      o.categoryCode === plan.categoryCode &&
      o.currency === plan.currency &&
      (o.locationCode ?? null) === (plan.locationCode ?? null) &&
      o.effectiveFrom <= (plan.effectiveTo ?? FAR) &&
      plan.effectiveFrom <= (o.effectiveTo ?? FAR),
  );
}

/** Category codes with no published plan effective today — invisible on customer search. */
export function unpricedCategories(
  categories: Array<{ code: string; displayName: string }>,
  plans: RatePlan[],
  today = todayIso(),
) {
  const covered = new Set(
    plans
      .filter(
        (p) =>
          p.status === 'published' &&
          p.effectiveFrom <= today &&
          (!p.effectiveTo || p.effectiveTo >= today),
      )
      .map((p) => p.categoryCode),
  );
  return categories.filter((c) => !covered.has(c.code));
}
