import type { ConfigVersion, PolicyPreview } from '@/lib/admin-hooks';

export interface PolicyKey {
  key: string;
  fields: string[];
}

/** The policy settings an operator can version. Labels resolve through i18n (`ops.cfg.key.*`, `ops.cfg.field.*`). */
export const POLICY_KEYS: PolicyKey[] = [
  { key: 'cancellation', fields: ['freeCancelHours', 'lateFeeBps'] },
  { key: 'fuel_rate', fields: ['minorPerPct'] },
];

/** Upper bounds mirrored from the API: a value past these is a fat-finger that would mis-price a customer. */
export const FIELD_MAX: Record<string, number> = {
  freeCancelHours: 8760,
  lateFeeBps: 10000,
  minorPerPct: 100000,
};

/** A field must be an explicit whole number within bounds — blank is not zero. */
export function checkField(name: string, raw: string): 'required' | 'invalid' | 'range' | null {
  const v = raw.trim();
  if (v === '') return 'required';
  if (!/^\d+$/.test(v)) return 'invalid';
  const max = FIELD_MAX[name];
  if (max != null && Number(v) > max) return 'range';
  return null;
}

export const payloadOf = (v: ConfigVersion) => v.payload as Record<string, number>;

/** Form values to start from: the given revision's, or blank. */
export const startValues = (key: PolicyKey, from?: ConfigVersion | null) =>
  Object.fromEntries(key.fields.map((f) => [f, String(from ? (payloadOf(from)[f] ?? '') : '')]));

export type PreviewLine = { id: string; params: Record<string, string | number> };

/** Which worked-example sentences apply to a previewed policy (the API returns the numbers, the UI words them). */
export function previewSentences(pp: PolicyPreview): Array<'cancelFee' | 'cancelFree' | 'fuel'> {
  const out: Array<'cancelFee' | 'cancelFree' | 'fuel'> = [];
  if (pp.key === 'cancellation' || pp.key == null) out.push('cancelFee', 'cancelFree');
  if (pp.key === 'fuel_rate' || pp.key == null) out.push('fuel');
  return out;
}
