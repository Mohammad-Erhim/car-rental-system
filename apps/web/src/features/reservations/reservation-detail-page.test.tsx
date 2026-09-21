import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservationDetailPage } from './reservation-detail-page';

const state = vi.hoisted(() => ({
  detail: { isLoading: true, isError: false, data: undefined as unknown, error: null as unknown },
}));

vi.mock('@carrental/client/react', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@carrental/client/react')),
  useAuth: () => ({ hasPermission: () => true }),
}));
// `useLocationAccess` is deliberately NOT mocked: it is a real hook, and a real hook after an
// early return is the whole bug
vi.mock('@/lib/invoice-hooks', () => ({ useOpsInvoices: () => ({ data: [] }) }));
vi.mock('@/lib/reservation-hooks', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/reservation-hooks')),
  useReservationDetail: () => ({ ...state.detail, refetch: vi.fn() }),
  useReservationHistory: () => ({ data: [], isLoading: false }),
}));

const reservation = {
  reference: 'DEMO-0105',
  state: 'confirmed',
  channel: 'guest',
  assignedRentalRef: null,
  pickedUnit: null,
  categoryCode: 'intermediate',
  pickupLocationCode: 'LHR',
  returnLocationCode: 'LHR',
  pickupAt: '2026-09-28T16:48:53.411Z',
  returnAt: '2026-09-29T16:48:53.411Z',
  durationHours: 24,
  currency: 'USD',
  subtotalMinor: 5400,
  taxMinor: 432,
  totalMinor: 5832,
  paidMinor: 5832,
  refundedMinor: 0,
  paymentBrand: 'amex',
  paymentLast4: null,
  createdAt: '2026-09-15T13:48:53.411Z',
  lines: [],
  drivers: [],
  cancellable: true,
  modifiable: true,
};

const tree = () => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/reservations/DEMO-0105']}>
      <I18nProvider initialLocale="en">
        <Routes>
          <Route path="/reservations/:reference" element={<ReservationDetailPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

/**
 * A page that calls a hook after its loading / error early returns crashes the moment the data
 * arrives ("Rendered more hooks than during the previous render") — the reservation and rental
 * detail pages both did. The only way to see it is to render the loading state first and then the
 * loaded one, which is exactly what a real request does.
 */
describe('ReservationDetailPage', () => {
  beforeEach(() => {
    state.detail = { isLoading: true, isError: false, data: undefined, error: null };
  });

  it('goes from loading to the loaded reservation without crashing', () => {
    const view = render(tree());
    state.detail = { isLoading: false, isError: false, data: reservation, error: null };
    view.rerender(tree());
    expect(screen.getByText('DEMO-0105')).toBeInTheDocument();
  });

  it('goes from loading to the error state without crashing', () => {
    const view = render(tree());
    state.detail = { isLoading: false, isError: true, data: undefined, error: new Error('boom') };
    view.rerender(tree());
    expect(screen.queryByText('DEMO-0105')).not.toBeInTheDocument();
  });
});
