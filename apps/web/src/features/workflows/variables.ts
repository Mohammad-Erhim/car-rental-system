import type { I18nContextValue } from '@carrental/i18n/react';

import type { RuleWords } from './builder/rule';

import { labelFor } from '@/lib/labels';

/**
 * How the request's variables ("amount", "hoursToPickup", …) are shown to people: a translated
 * label when we know the variable, else the key made readable ("reasonCode" → "Reason code"),
 * and money variables as money in the request's own currency. One place, so the routing rules,
 * the step summaries and the request page all say the same thing.
 */
type Tr = Pick<I18nContextValue, 't' | 'resolvedLocaleFor'>;

export function variableLabel(i18n: Tr, key: string): string {
  return labelFor(i18n, `ops.wf.var.${key}`, key);
}

/** Variables holding integer minor units of the request's `currency`. */
const MONEY = new Set(['amount', 'fee', 'refund', 'total']);

export function variableValue(
  { t, fmt }: Pick<I18nContextValue, 't' | 'fmt'>,
  key: string,
  value: unknown,
  context: Record<string, unknown>,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return t(value ? 'ops.wf.yes' : 'ops.wf.no');
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (MONEY.has(key) && typeof value === 'number' && typeof context.currency === 'string')
    return fmt.money({ amountMinor: value, currency: context.currency });
  return String(value);
}

/** The words for `describeRule`, in the person's language. */
export function ruleWords(i18n: Tr): RuleWords {
  return {
    label: (v) => variableLabel(i18n, v),
    and: i18n.t('ops.wfb.and'),
    or: i18n.t('ops.wfb.or'),
  };
}
