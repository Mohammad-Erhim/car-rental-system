import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CarFront, Tag } from 'lucide-react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CommandMenu } from './command-menu';
import type { NavGroup } from './nav-config';

const groups: NavGroup[] = [
  {
    titleKey: 'ops.navGroup.operations',
    items: [{ to: '/fleet', label: 'ops.nav.fleet', icon: CarFront }],
  },
  {
    titleKey: 'ops.navGroup.catalogue',
    items: [{ to: '/config/rate-plans', label: 'ops.nav.ratePlans', icon: Tag }],
  },
];

function Path() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function setup() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/']}>
        <CommandMenu groups={groups} />
        <Path />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('CommandMenu', () => {
  it('opens from the trigger and lists every destination', () => {
    setup();
    expect(screen.queryByTestId('cmdk-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    expect(screen.getByTestId('cmdk-input')).toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-/fleet')).toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-/config/rate-plans')).toBeInTheDocument();
  });

  it('opens with Ctrl+K', () => {
    setup();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('cmdk-input')).toBeInTheDocument();
  });

  it('filters by label and shows an empty state', () => {
    setup();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    fireEvent.change(screen.getByTestId('cmdk-input'), { target: { value: 'rate' } });
    expect(screen.queryByTestId('cmdk-item-/fleet')).not.toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-/config/rate-plans')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cmdk-input'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No matching section')).toBeInTheDocument();
  });

  it('selecting a result navigates there and closes', () => {
    setup();
    fireEvent.click(screen.getByTestId('cmdk-open'));
    fireEvent.click(screen.getByTestId('cmdk-item-/config/rate-plans'));
    expect(screen.getByTestId('path')).toHaveTextContent('/config/rate-plans');
    expect(screen.queryByTestId('cmdk-input')).not.toBeInTheDocument();
  });
});
