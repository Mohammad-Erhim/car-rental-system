import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs } from './breadcrumbs';
import type { NavGroup } from './nav-config';

const icon = (() => null) as unknown as NavGroup['items'][number]['icon'];
const groups: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'ops.nav.dashboard', icon },
      { to: '/work', label: 'ops.nav.reservations', icon },
      { to: '/config', label: 'ops.nav.configuration', icon },
      { to: '/config/rate-plans', label: 'ops.nav.ratePlans', icon },
    ],
  },
];

function at(path: string) {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={[path]}>
        <Breadcrumbs groups={groups} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Breadcrumbs', () => {
  it('shows only the page title on the dashboard', () => {
    at('/');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Dashboard');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is Dashboard › screen for a top-level route, last crumb aria-current', () => {
    at('/work');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Dashboard.*Reservations/,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    const current = screen.getByText('Reservations');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
  });

  it('inserts the Configuration crumb for a /config/* route', () => {
    at('/config/rate-plans');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Dashboard.*Configuration.*Rate plans/,
    );
    expect(screen.getByRole('link', { name: 'Configuration' })).toHaveAttribute('href', '/config');
  });

  it('links a detail route back to its list page and shows the id as current', () => {
    at('/work/RES-12345');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Dashboard.*Reservations.*RES-12345/,
    );
    expect(screen.getByRole('link', { name: 'Reservations' })).toHaveAttribute('href', '/work');
    expect(screen.getByText('RES-12345')).toHaveAttribute('aria-current', 'page');
  });
});
