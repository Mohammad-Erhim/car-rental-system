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
export const toMinor = (s: string) => Math.round(Number(s) * 100);
export const fromMinor = (m: number) => (m / 100).toFixed(2);

export const emptyPlanValues = (): PlanValues => ({
  categoryCode: '',
  name: '',
  scope: '',
  currency: 'USD',
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
    baseDay: fromMinor(p.baseDayMinor),
    hour: p.hourMinor ? fromMinor(p.hourMinor) : '',
    taxPct: String(p.taxBps / 100),
    minDuration: String(p.minDurationHours),
    maxDuration: p.maxDurationHours == null ? '' : String(p.maxDurationHours),
    fees: p.fees.map((f) => ({
      code: f.code,
      label: f.label,
      amount: fromMinor(f.amountMinor),
      taxable: f.taxable ?? true,
    })),
    tiers: p.tiers.map((t) => ({ minHours: String(t.minHours), day: fromMinor(t.dayMinor) })),
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
    baseDayMinor: toMinor(v.baseDay),
    hourMinor: v.hour.trim() ? toMinor(v.hour) : 0,
    minDurationHours: Math.round(Number(v.minDuration)),
    maxDurationHours: v.maxDuration.trim() ? Math.round(Number(v.maxDuration)) : null,
    taxBps: Math.round(Number(v.taxPct) * 100),
    fees: v.fees.map((f) => ({
      code: f.code.trim(),
      label: f.label.trim(),
      amountMinor: toMinor(f.amount),
      taxable: f.taxable,
    })),
    tiers: v.tiers.map((t) => ({
      minHours: Math.round(Number(t.minHours)),
      dayMinor: toMinor(t.day),
    })),
  };
}

export const isEditable = (status: RatePlan['status']) =>
  status === 'draft' || status === 'in_review';

/** Published plans that publishing `plan` would supersede (same category + scope, overlapping dates). */
export function wouldReplace(plan: RatePlan, all: RatePlan[]): RatePlan[] {
  const FAR = '9999-12-31';
  return all.filter(
    (o) =>
      o.id !== plan.id &&
      o.status === 'published' &&
      o.categoryCode === plan.categoryCode &&
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
