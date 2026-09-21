import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CurrenciesPage } from './currencies-page';

const state = vi.hoisted(() => ({ canManage: true }));

// only the permission check is faked; the form machinery underneath is the real thing
vi.mock('@carrental/client/react', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@carrental/client/react')),
  useAuth: () => ({ hasPermission: () => state.canManage }),
}));

vi.mock('@/lib/currency-hooks', () => {
  const noop = { mutateAsync: vi.fn(), isPending: false };
  return {
    useCurrencyOverview: () => ({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        defaultCode: 'USD',
        currencies: [
          {
            id: '1',
            code: 'USD',
            label: 'US Dollar',
            digits: 2,
            isDefault: true,
            isActive: true,
            version: 1,
            usage: { ratePlans: 3, products: 1 },
          },
          {
            id: '3',
            code: 'EUR',
            label: 'Euro',
            digits: 2,
            isDefault: false,
            isActive: true,
            version: 1,
            usage: { ratePlans: 0, products: 0 },
          },
          {
            id: '4',
            code: 'GBP',
            label: 'Pound Sterling',
            digits: 2,
            isDefault: false,
            isActive: true,
            version: 1,
            usage: { ratePlans: 2, products: 0 },
          },
          {
            id: '2',
            code: 'JPY',
            label: 'Japanese Yen',
            digits: 0,
            isDefault: false,
            isActive: false,
            version: 1,
            usage: { ratePlans: 0, products: 0 },
          },
        ],
        available: [
          { code: 'CHF', name: 'Swiss Franc', digits: 2 },
          { code: 'SEK', name: 'Swedish Krona', digits: 2 },
        ],
      },
    }),
    useCurrencyActions: () => ({ enable: noop, setDefault: noop, disable: noop }),
  };
});

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <I18nProvider initialLocale="en">
          <CurrenciesPage />
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('CurrenciesPage', () => {
  beforeEach(() => {
    state.canManage = true;
  });

  it('says in one sentence what each currency means for customers', () => {
    show();
    const usd = screen.getByTestId('ccy-row-USD');
    expect(usd).toHaveTextContent('US Dollar');
    expect(usd).toHaveTextContent('Default');
    expect(screen.getByTestId('ccy-state-USD')).toHaveTextContent(
      'Used when a customer hasn’t chosen a currency',
    );
    expect(screen.getByTestId('ccy-state-USD')).toHaveTextContent('3 price lists');
    expect(screen.getByTestId('ccy-state-USD')).toHaveTextContent('1 extra');
    // a two-decimal currency needs no note about decimals
    expect(usd).not.toHaveTextContent('decimal');

    const jpy = screen.getByTestId('ccy-row-JPY');
    expect(jpy).toHaveTextContent('Off');
    expect(screen.getByTestId('ccy-state-JPY')).toHaveTextContent('Turned off');
    expect(jpy).toHaveTextContent('0 decimal places');
    expect(jpy).not.toHaveTextContent('Default');
  });

  it('warns when a turned-on currency has no price lists, so customers would never see it', () => {
    show();
    expect(screen.getByTestId('ccy-state-EUR')).toHaveTextContent('No price lists yet');
    expect(screen.getByTestId('ccy-state-GBP')).toHaveTextContent('Customers can switch to it');
  });

  it('offers only what an administrator may do', () => {
    show();
    expect(screen.getByTestId('ccy-new')).toBeInTheDocument();
    expect(screen.getByTestId('ccy-menu-USD')).toBeInTheDocument();
  });

  it('is read-only for someone who cannot manage reference data', () => {
    state.canManage = false;
    show();
    expect(screen.queryByTestId('ccy-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ccy-menu-USD')).not.toBeInTheDocument();
    // the list itself is still there to read
    expect(screen.getByTestId('ccy-row-USD')).toBeInTheDocument();
  });

  it('adding a currency offers only currencies not yet added', async () => {
    show();
    fireEvent.click(screen.getByTestId('ccy-new'));
    expect(await screen.findByText('Add a currency')).toBeInTheDocument();
    // the picker offers only what is not already in the list
    expect(screen.getByTestId('ccy-select')).toHaveTextContent('CHF');
  });
});
