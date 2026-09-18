import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategorySheet } from './category-sheet';

import type { CategoryView } from '@/lib/admin-hooks';

const existing: CategoryView = {
  id: '1',
  code: 'suv',
  class: 'suv',
  displayName: 'SUV',
  description: null,
  passengers: 7,
  luggage: 4,
  doors: 5,
  transmission: 'automatic',
  imageRef: null,
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
  features: [],
  version: 1,
};

const show = (category: CategoryView | null = null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="en">
        <CategorySheet category={category} existingCodes={['suv']} open onOpenChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe('CategorySheet', () => {
  it('will not save without a name, code or class', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect((await screen.findAllByText('This is required')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
  });

  it('refuses a code that is already taken', async () => {
    show();
    fireEvent.change(screen.getByTestId('category-code'), { target: { value: 'suv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect(await screen.findByText('That code is already in use.')).toBeInTheDocument();
  });

  it('keeps only digits in the capacity fields and range-checks them', async () => {
    show();
    const passengers = screen.getByTestId('category-passengers') as HTMLInputElement;
    fireEvent.change(passengers, { target: { value: '9x9' } });
    expect(passengers.value).toBe('99');
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect(await screen.findByText('Enter a whole number from 1 to 60.')).toBeInTheDocument();
  });

  it('shows the code as fixed text when editing', () => {
    show(existing);
    expect(screen.queryByTestId('category-code')).not.toBeInTheDocument();
    expect(screen.getByText('Edit SUV')).toBeInTheDocument();
    expect((screen.getByTestId('category-passengers') as HTMLInputElement).value).toBe('7');
  });
});
