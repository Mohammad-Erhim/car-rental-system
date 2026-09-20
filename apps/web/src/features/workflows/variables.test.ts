import { createFormatters } from '@carrental/i18n';
import { describe, expect, it } from 'vitest';

import { describeRule } from './builder/rule';
import { ruleWords, variableLabel, variableValue } from './variables';

const known = new Set(['ops.wf.var.amount']);
const i18n = {
  t: (k: string) => (k === 'ops.wf.var.amount' ? 'Amount' : k === 'ops.wf.yes' ? 'Yes' : k),
  resolvedLocaleFor: (k: string) => (known.has(k) ? 'en' : null),
  fmt: createFormatters('en'),
};

describe('request variables', () => {
  it('uses the translated label, else makes the key readable', () => {
    expect(variableLabel(i18n, 'amount')).toBe('Amount');
    expect(variableLabel(i18n, 'hoursToPickup')).toBe('Hours to pickup');
    expect(variableLabel(i18n, 'reason_code')).toBe('Reason code');
  });

  it('shows money in the request currency, yes/no, and a dash for nothing', () => {
    expect(variableValue(i18n, 'fee', 12550, { currency: 'USD' })).toBe('$125.50');
    expect(variableValue(i18n, 'goodwill', true, {})).toBe('Yes');
    expect(variableValue(i18n, 'note', null, {})).toBe('—');
    expect(variableValue(i18n, 'amount', 900, {})).toBe('900');
  });

  it('describes a rule with the labels and words of the language', () => {
    const words = {
      ...ruleWords({ ...i18n, t: (k) => (k === 'ops.wfb.and' ? 'et' : i18n.t(k)) }),
    };
    expect(
      describeRule(
        { and: [{ '>': [{ var: 'amount' }, 500] }, { '==': [{ var: 'locationCode' }, 'LHR'] }] },
        words,
      ),
    ).toBe('Amount > 500 et Location code = LHR');
  });
});
