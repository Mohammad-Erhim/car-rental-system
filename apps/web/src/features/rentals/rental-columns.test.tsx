import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RentalCard, displayState } from './rental-columns';

import type { RentalBoardRow } from '@/lib/rental-hooks';

let held = ['rental.pickup', 'rental.return', 'fleet.manage'];
vi.mock('@carrental/client/react', async () => {
  const actual = await vi.importActual<object>('@carrental/client/react');
  return {
    ...actual,
    useAuth: () => ({ hasPermission: (...p: string[]) => p.some((x) => held.includes(x)) }),
  };
});

const row = (over: Partial<RentalBoardRow> = {}): RentalBoardRow =>
  ({
    reference: 'RNT-1',
    reservationReference: 'RES-1',
    state: 'awaiting_pickup',
    unitId: 'u1',
    pickupLocationCode: 'JFK',
    returnLocationCode: 'JFK',
    scheduledPickupAt: '2026-09-30T10:00:00.000Z',
    scheduledReturnAt: '2026-10-03T10:00:00.000Z',
    pickedUpAt: null,
    returnedAt: null,
    odometerOutKm: null,
    fuelOutPct: null,
    currency: 'USD',
    settlementMinor: 0,
    agreementVersion: null,
    readinessOutcome: null,
    overdue: false,
    plate: 'JFK-EC01',
    vehicle: '2024 Toyota Aygo X',
    categoryCode: 'economy',
    driverName: 'Sydney Searcher',
    customerName: 'Demo Customer',
    ...over,
  }) as RentalBoardRow;

function show(r: RentalBoardRow, onAction = vi.fn()) {
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <RentalCard row={r} onAction={onAction} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return onAction;
}

describe('RentalCard actions', () => {
  it('offers pickup for a rental awaiting pickup', () => {
    held = ['rental.pickup'];
    const onAction = show(row());
    fireEvent.click(screen.getByRole('button', { name: 'Run pickup' }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'RNT-1' }),
      'pickup',
    );
  });

  it('offers return for an active rental, and incident from the menu', () => {
    held = ['rental.return', 'rental.pickup'];
    show(row({ state: 'active' }));
    expect(screen.getByRole('button', { name: 'Run return' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('offers the readiness check on a closed rental that has not had one', () => {
    held = ['fleet.manage'];
    show(row({ state: 'closed' }));
    expect(screen.getByRole('button', { name: 'Readiness check' })).toBeInTheDocument();
  });

  it('shows the outcome instead once readiness has been recorded', () => {
    held = ['fleet.manage'];
    show(row({ state: 'closed', readinessOutcome: 'passed' }));
    expect(screen.queryByRole('button', { name: 'Readiness check' })).toBeNull();
    expect(screen.getByText('Ready — passed')).toBeInTheDocument();
  });

  it('shows nothing to do without the permission', () => {
    held = [];
    show(row());
    expect(screen.queryByRole('button', { name: 'Run pickup' })).toBeNull();
  });
});

describe('displayState', () => {
  it('reads a live-overdue active rental as overdue', () => {
    expect(displayState(row({ state: 'active', overdue: true }))).toBe('overdue');
    expect(displayState(row({ state: 'active' }))).toBe('active');
  });
});
