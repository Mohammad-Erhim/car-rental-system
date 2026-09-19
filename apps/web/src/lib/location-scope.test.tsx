import { I18nProvider } from '@carrental/i18n/react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocationOption } from './location-hooks';

const auth = { actor: { accountId: 'acc-1', locationScope: [] as string[] } };
vi.mock('@carrental/client/react', () => ({ useAuth: () => auth }));

const options: LocationOption[] = [
  { id: '1', code: 'LHR', name: 'Heathrow', status: 'active', timezone: 'UTC' },
  { id: '2', code: 'JFK', name: 'JFK', status: 'active', timezone: 'UTC' },
  { id: '3', code: 'PAR', name: 'Paris', status: 'active', timezone: 'UTC' },
  { id: '4', code: 'OLD', name: 'Old branch', status: 'archived', timezone: 'UTC' },
];
const query = {
  status: 'success' as 'success' | 'pending' | 'error',
  data: { restricted: false, options } as
    | { restricted: boolean; options: LocationOption[] }
    | undefined,
};
vi.mock('./location-hooks', () => ({
  useLocationOptions: () => ({ ...query, refetch: vi.fn() }),
}));
const warn = vi.fn();
vi.mock('sonner', () => ({ toast: { warning: (m: string) => warn(m) } }));

const { LocationScopeProvider, useLocationScope } = await import('./location-scope');

let scope: ReturnType<typeof useLocationScope>;
let where = '';
const renders: Array<{ ready: boolean; url: string }> = [];
function Probe() {
  scope = useLocationScope();
  const loc = useLocation();
  where = loc.pathname + loc.search;
  renders.push({ ready: scope.ready, url: where });
  return null;
}
function mount(url: string) {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={[url]}>
        <LocationScopeProvider>
          <Probe />
        </LocationScopeProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  renders.length = 0;
  localStorage.clear();
  warn.mockClear();
  query.status = 'success';
  query.data = { restricted: false, options };
  auth.actor = { accountId: 'acc-1', locationScope: [] };
});

describe('LocationScopeProvider', () => {
  it('reads the selection from the URL on a branch-aware page', async () => {
    mount('/reservations?location=LHR,JFK');
    await waitFor(() => expect(scope.ready).toBe(true));
    expect(scope.selected).toEqual(['LHR', 'JFK']);
    expect(scope.codes).toBe('LHR,JFK');
  });

  it('no selection means "all of my locations" (no codes sent)', async () => {
    mount('/reservations');
    await waitFor(() => expect(scope.ready).toBe(true));
    expect(scope.selected).toEqual([]);
    expect(scope.codes).toBeUndefined();
  });

  it('drops codes the account may not see, fixes the URL and says so once', async () => {
    mount('/rentals?location=LHR,XXX,YYY&page=3');
    await waitFor(() => expect(where).toBe('/rentals?location=LHR'));
    expect(scope.selected).toEqual(['LHR']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('XXX');
  });

  it('a wholly invalid selection falls back to all', async () => {
    mount('/fleet?location=NOPE');
    await waitFor(() => expect(where).toBe('/fleet'));
    expect(scope.selected).toEqual([]);
  });

  it('choosing locations writes the URL, resets paging and is remembered per account', async () => {
    mount('/reservations?page=4');
    await waitFor(() => expect(scope.ready).toBe(true));
    act(() => scope.setSelected(['JFK', 'PAR']));
    await waitFor(() => expect(where).toBe('/reservations?location=JFK%2CPAR'));
    expect(localStorage.getItem('carrental.ops.location.acc-1')).toBe('JFK,PAR');
  });

  it('selecting every active branch collapses to "all"', async () => {
    mount('/reservations?location=LHR');
    await waitFor(() => expect(scope.ready).toBe(true));
    act(() => scope.setSelected(['LHR', 'JFK', 'PAR']));
    await waitFor(() => expect(where).toBe('/reservations'));
    expect(localStorage.getItem('carrental.ops.location.acc-1')).toBeNull();
  });

  it('an archived branch is selectable on its own (history) and does not collapse to "all"', async () => {
    mount('/reservations');
    await waitFor(() => expect(scope.ready).toBe(true));
    act(() => scope.setSelected(['OLD']));
    await waitFor(() => expect(scope.selected).toEqual(['OLD']));
  });

  it('applies the remembered choice to a branch-aware page opened without one', async () => {
    localStorage.setItem('carrental.ops.location.acc-1', 'PAR');
    mount('/fleet');
    await waitFor(() => expect(where).toBe('/fleet?location=PAR'));
    expect(scope.selected).toEqual(['PAR']);
  });

  it('holds the page (not ready) for the render that fills the URL in', async () => {
    localStorage.setItem('carrental.ops.location.acc-1', 'PAR');
    mount('/fleet');
    await waitFor(() => expect(scope.ready).toBe(true));
    // no render ever showed the page as ready while its URL still lacked the remembered choice
    expect(renders.some((r) => r.url === '/fleet' && r.ready)).toBe(false);
    expect(renders.some((r) => r.url === '/fleet' && !r.ready)).toBe(true);
  });

  it('a remembered choice belongs to the account, not the browser', async () => {
    localStorage.setItem('carrental.ops.location.someone-else', 'PAR');
    mount('/fleet');
    await waitFor(() => expect(scope.ready).toBe(true));
    expect(scope.selected).toEqual([]);
  });

  it('leaves the URL alone on pages that are not branch-aware, but keeps the choice', async () => {
    localStorage.setItem('carrental.ops.location.acc-1', 'JFK');
    mount('/admin/staff');
    await waitFor(() => expect(scope.ready).toBe(true));
    expect(where).toBe('/admin/staff');
    expect(scope.scopedPage).toBe(false);
    expect(scope.selected).toEqual(['JFK']);
  });

  it('never fires scoped queries until the options are known, and keeps the stored choice on error', async () => {
    query.status = 'error';
    query.data = undefined;
    localStorage.setItem('carrental.ops.location.acc-1', 'JFK');
    mount('/reservations');
    expect(scope.ready).toBe(false);
    expect(scope.error).toBe(true);
    expect(localStorage.getItem('carrental.ops.location.acc-1')).toBe('JFK');
  });

  it('knows whether the account is limited — from the server, not the (possibly stale) session', async () => {
    auth.actor = { accountId: 'acc-1', locationScope: [] }; // session snapshot says org-wide…
    query.data = { restricted: true, options: options.slice(0, 1) }; // …the server says it was narrowed
    mount('/reservations');
    await waitFor(() => expect(scope.ready).toBe(true));
    expect(scope.restricted).toBe(true);
    expect(scope.nameOf('LHR')).toBe('Heathrow');
    expect(scope.nameOf('ZZZ')).toBe('ZZZ');
  });
});
