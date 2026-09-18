import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ReservationCard } from './reservation-columns';

import type { OpsReservationRow } from '@/lib/reservation-hooks';

let permitted = true;
vi.mock('@carrental/client/react', async () => {
  const actual = await vi.importActual<object>('@carrental/client/react');
  return { ...actual, useAuth: () => ({ hasPermission: () => permitted }) };
});

const row = (over: Partial<OpsReservationRow> = {}): OpsReservationRow => ({
  reference: 'RES-1',
  state: 'confirmed',
  channel: 'customer',
  categoryCode: 'economy',
  pickupLocationCode: 'JFK',
  returnLocationCode: 'LHR',
  pickupAt: '2026-09-30T10:00:00.000Z',
  returnAt: '2026-10-03T10:00:00.000Z',
  currency: 'USD',
  totalMinor: 12000,
  paidMinor: 12000,
  driverName: 'Amira Haddad',
  assignedRentalRef: null,
  pickedUnit: null,
  ...over,
});

function show(r: OpsReservationRow, onAssign = vi.fn()) {
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <ReservationCard row={r} onAssign={onAssign} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return onAssign;
}

describe('ReservationCard', () => {
  it('offers "Assign vehicle" for a confirmed reservation without a rental', () => {
    permitted = true;
    const onAssign = show(row());
    fireEvent.click(screen.getByRole('button', { name: 'Assign vehicle' }));
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ reference: 'RES-1' }));
  });

  it('links to the rental instead once one exists', () => {
    permitted = true;
    show(row({ assignedRentalRef: 'RNT-9' }));
    expect(screen.queryByRole('button', { name: 'Assign vehicle' })).toBeNull();
    expect(screen.getByRole('link', { name: /Open rental/ })).toHaveAttribute(
      'href',
      '/rentals/RNT-9',
    );
  });

  it('hides the action without the permission or in another state', () => {
    permitted = false;
    show(row());
    expect(screen.queryByRole('button', { name: 'Assign vehicle' })).toBeNull();
  });

  it('shows the customer-picked car and the route when the return branch differs', () => {
    permitted = true;
    show(row({ pickedUnit: { id: 'u1', plate: 'X1', make: 'Ford', model: 'Focus' } }));
    expect(screen.getByText(/Customer picked: Ford Focus/)).toBeInTheDocument();
    expect(screen.getByText(/JFK → LHR/)).toBeInTheDocument();
  });
});
