import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs } from './breadcrumbs';
import type { NavGroup } from './nav-config';

const icon = (() => null) as unknown as NavGroup['items'][number]['icon'];
const groups: NavGroup[] = [
  { items: [{ to: '/', label: 'ops.nav.dashboard', icon }] },
  {
    titleKey: 'ops.navGroup.operations',
    items: [{ to: '/reservations', label: 'ops.nav.reservations', icon }],
  },
  {
    titleKey: 'ops.navGroup.website',
    items: [
      {
        to: '/website/languages',
        label: 'ops.nav.languages',
        icon,
        end: true,
        children: [{ to: '/website/translations', label: 'ops.nav.translations', icon }],
      },
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
    at('/reservations');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Dashboard.*Reservations/,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    const current = screen.getByText('Reservations');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
  });

  it('shows the group heading as plain text before the screen', () => {
    at('/reservations');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent(/Dashboard.*Operations.*Reservations/);
    expect(screen.getByText('Operations').closest('a')).toBeNull();
  });

  it('includes the parent page of a nested screen, as a link', () => {
    at('/website/translations');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Dashboard.*Website.*Languages.*Translations/,
    );
    expect(screen.getByRole('link', { name: 'Languages' })).toHaveAttribute(
      'href',
      '/website/languages',
    );
  });

  it('links a detail route back to its list page and shows the id as current', () => {
    at('/reservations/RES-12345');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Dashboard.*Reservations.*RES-12345/,
    );
    expect(screen.getByRole('link', { name: 'Reservations' })).toHaveAttribute(
      'href',
      '/reservations',
    );
    expect(screen.getByText('RES-12345')).toHaveAttribute('aria-current', 'page');
  });
});
