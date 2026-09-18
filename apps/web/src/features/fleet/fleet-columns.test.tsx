import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UnitCard } from './fleet-columns';

import type { OpsUnit } from '@/lib/ops-discovery-hooks';

let manage = true;
vi.mock('@carrental/client/react', async () => {
  const actual = await vi.importActual<object>('@carrental/client/react');
  return { ...actual, useAuth: () => ({ hasPermission: () => manage }) };
});

const unit = (over: Partial<OpsUnit> = {}): OpsUnit => ({
  id: 'u1',
  categoryCode: 'compact',
  categoryName: 'Compact',
  currentLocationCode: 'JFK',
  homeLocationCode: 'JFK',
  vin: 'VIN1',
  plate: 'JFK-COM1',
  make: 'Ford',
  model: 'Focus',
  year: '2024',
  colour: 'Black',
  state: 'available',
  imageRef: null,
  imageUrl: null,
  version: 1,
  ...over,
});

function show(u: OpsUnit, holds: string[] = []) {
  const onAction = vi.fn();
  render(
    <I18nProvider initialLocale="en">
      <UnitCard unit={u} holds={holds} onAction={onAction} />
    </I18nProvider>,
  );
  return onAction;
}

describe('UnitCard', () => {
  it('shows the vehicle, plate and localised state', () => {
    show(unit({ state: 'on_rent' }));
    expect(screen.getByText('2024 Ford Focus')).toBeInTheDocument();
    expect(screen.getByText('JFK-COM1')).toBeInTheDocument();
    expect(screen.getByText('On rent')).toBeInTheDocument();
  });

  it('flags an active hold even when the state still reads available', () => {
    show(unit(), ['damage']);
    expect(screen.getByText('held: Damage')).toBeInTheDocument();
  });

  it('offers the action menu to a fleet manager', () => {
    manage = true;
    show(unit());
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('has no menu without fleet.manage', () => {
    manage = false;
    show(unit());
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});
