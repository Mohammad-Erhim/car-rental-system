import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CarFront, LayoutDashboard, Tag } from 'lucide-react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CommandPalette, type CommandItem } from './command-palette.js';

const items: CommandItem[] = [
  { to: '/', label: 'ops.nav.dashboard', Icon: LayoutDashboard },
  { to: '/fleet', label: 'ops.nav.fleet', Icon: CarFront, groupKey: 'ops.navGroup.operations' },
  {
    to: '/config/rate-plans',
    label: 'ops.nav.ratePlans',
    Icon: Tag,
    groupKey: 'ops.navGroup.catalogue',
  },
];

function LocationProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function wrap() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette items={items} />
        <LocationProbe />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('CommandPalette (STAGE-012)', () => {
  it('opens from the trigger and lists every destination', () => {
    wrap();
    expect(screen.queryByTestId('cmdk-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    expect(screen.getByTestId('cmdk-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('cmdk-results').querySelectorAll('li')).toHaveLength(3);
  });

  it('filters by label, including a fuzzy subsequence', () => {
    wrap();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    fireEvent.change(screen.getByTestId('cmdk-input'), { target: { value: 'rp' } });
    const rows = screen.getByTestId('cmdk-results').querySelectorAll('li');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Rate plans');
  });

  it('shows a no-results state for a query that matches nothing', () => {
    wrap();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    fireEvent.change(screen.getByTestId('cmdk-input'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching section')).toHaveAttribute('data-appstate', 'no-results');
  });

  it('Enter navigates to the active result and closes', () => {
    wrap();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    fireEvent.change(screen.getByTestId('cmdk-input'), { target: { value: 'fleet' } });
    fireEvent.keyDown(screen.getByTestId('cmdk-input'), { key: 'Enter' });
    expect(screen.getByTestId('path')).toHaveTextContent('/fleet');
    expect(screen.queryByTestId('cmdk-dialog')).not.toBeInTheDocument();
  });

  it('clicking a result navigates there', () => {
    wrap();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    fireEvent.click(screen.getByTestId('cmdk-item-/config/rate-plans'));
    expect(screen.getByTestId('path')).toHaveTextContent('/config/rate-plans');
  });
});
