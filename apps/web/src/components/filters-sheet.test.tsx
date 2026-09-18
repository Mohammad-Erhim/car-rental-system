import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FiltersSheet, type FilterField } from './filters-sheet';

const fields: FilterField[] = [
  {
    type: 'select',
    name: 'category',
    label: 'Category',
    anyLabel: 'Any category',
    options: [{ value: 'suv', label: 'SUV' }],
  },
  { type: 'dateRange', fromLabel: 'From', toLabel: 'Until' },
];

function setup(values: Record<string, string> = {}) {
  const onApply = vi.fn();
  render(
    <I18nProvider initialLocale="en">
      <FiltersSheet
        open
        onOpenChange={() => {}}
        fields={fields}
        values={values}
        onApply={onApply}
      />
    </I18nProvider>,
  );
  return onApply;
}

describe('FiltersSheet', () => {
  it('renders the configured fields', () => {
    setup({ category: '', from: '', to: '' });
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('Until')).toBeInTheDocument();
  });

  it('applies the edited values', async () => {
    const onApply = setup({ category: '', from: '', to: '' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-01', to: '' })),
    );
  });

  it('refuses an end date before the start date', async () => {
    const onApply = setup({ category: '', from: '', to: '' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(
      await screen.findByText('The end date must be on or after the start date.'),
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('reset clears every field', async () => {
    const onApply = setup({ category: 'suv', from: '2026-09-01', to: '2026-09-02' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ category: '', from: '', to: '' }));
  });
});
