import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { actionLabel, OutcomeBadge, targetLabel } from './audit-labels';

const texts: Record<string, string> = {
  'ops.audit.act.iam.signin.succeeded': 'Signed in',
  'ops.audit.outcome.failed': 'Failed',
};
const i18n = {
  t: (k: string) => texts[k] ?? k,
  resolvedLocaleFor: (k: string) => (k in texts ? 'en' : null),
};

describe('audit labels', () => {
  it('says known actions in words and makes other codes readable', () => {
    expect(actionLabel(i18n, 'iam.signin.succeeded')).toBe('Signed in');
    expect(actionLabel(i18n, 'iam.step_up.rotated')).toBe('Step up rotated');
    expect(actionLabel(i18n, 'workflow.instance.created')).toBe('Workflow instance created');
    expect(actionLabel(i18n, 'ops.search')).toBe('Ops search');
  });

  it('names the kind of record', () => {
    expect(targetLabel(i18n, 'config_version')).toBe('Config version');
  });

  it('shows the outcome as a word', () => {
    render(
      <I18nProvider initialLocale="en">
        <OutcomeBadge outcome="rejected" />
      </I18nProvider>,
    );
    expect(screen.getByText(/rejected/i)).toBeInTheDocument();
  });
});
