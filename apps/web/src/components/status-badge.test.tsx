import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge';

const show = (status: string) =>
  render(
    <I18nProvider initialLocale="en">
      <StatusBadge status={status} />
    </I18nProvider>,
  );

describe('StatusBadge', () => {
  it('uses the localised label', () => {
    show('awaiting_pickup');
    expect(screen.getByText('Awaiting pickup')).toBeInTheDocument();
  });

  it('falls back to a readable label for an unknown state', () => {
    show('on_hold');
    expect(screen.getByText(/on hold/i)).toBeInTheDocument();
  });
});
