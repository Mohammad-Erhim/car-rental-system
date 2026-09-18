import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanSheet } from './plan-sheet';

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="en">
        <PlanSheet plan={null} open onOpenChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe('PlanSheet', () => {
  it('starts with sensible defaults', () => {
    show();
    expect((screen.getByTestId('rp-base') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('New rate plan (draft)')).toBeInTheDocument();
  });

  it('will not create a plan without a name, category or price', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect((await screen.findAllByText('This is required')).length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('Enter a valid value')).toBeInTheDocument();
  });

  it('rejects a price with more than two decimals', async () => {
    show();
    fireEvent.change(screen.getByTestId('rp-base'), { target: { value: '12.345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Enter a valid value')).toBeInTheDocument();
  });

  it('adds a fee row with its own fields', () => {
    show();
    fireEvent.click(screen.getByTestId('rp-add-fee'));
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Shown as')).toBeInTheDocument();
  });
});
