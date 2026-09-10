import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs, type CrumbSource } from './breadcrumbs.js';

const items: CrumbSource[] = [
  { to: '/', label: 'ops.nav.dashboard' },
  { to: '/work', label: 'ops.nav.reservations' },
  { to: '/config', label: 'ops.nav.configuration' },
  { to: '/config/rate-plans', label: 'ops.nav.ratePlans' },
  { to: '/admin/staff', label: 'ops.nav.staff' },
];

function at(path: string) {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={[path]}>
        <Breadcrumbs items={items} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Breadcrumbs (STAGE-012)', () => {
  it('renders nothing on the dashboard', () => {
    const { container } = at('/');
    expect(container).toBeEmptyDOMElement();
  });

  it('is Dashboard › screen for a top-level route, last crumb aria-current', () => {
    at('/work');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent(/Dashboard.*Reservations/);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    const current = screen.getByText('Reservations');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
  });

  it('inserts the Configuration crumb for a /config/* route', () => {
    at('/config/rate-plans');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent(/Dashboard.*Configuration.*Rate plans/);
    expect(screen.getByRole('link', { name: 'Configuration' })).toHaveAttribute('href', '/config');
  });

  it('links a detail route back to its list page and shows the id as current', () => {
    at('/work/RES-12345');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent(/Dashboard.*Reservations.*RES-12345/);
    expect(screen.getByRole('link', { name: 'Reservations' })).toHaveAttribute('href', '/work');
    expect(screen.getByText('RES-12345')).toHaveAttribute('aria-current', 'page');
  });
});
