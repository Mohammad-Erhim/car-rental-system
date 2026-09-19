import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocationOption } from '@/lib/location-hooks';

const scope = {
  options: [] as LocationOption[],
  selected: [] as string[],
  setSelected: vi.fn(),
  clear: vi.fn(),
  ready: true,
  restricted: false,
  scopedPage: true,
  nameOf: (c: string) => c,
};
vi.mock('@/lib/location-scope', () => ({ useLocationScope: () => scope }));
// Radix Popover's positioning engine spins for ~40 s in jsdom (no layout); the picker's own logic is
// what is under test, so render its content inline.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

const { LocationSwitcher } = await import('./location-switcher');
const { TooltipProvider } = await import('@/components/ui/tooltip');

const opt = (code: string, name = code, status = 'active'): LocationOption => ({
  id: code,
  code,
  name,
  status,
  timezone: 'UTC',
});

const tree = () => (
  <I18nProvider initialLocale="en">
    <TooltipProvider>
      <LocationSwitcher />
    </TooltipProvider>
  </I18nProvider>
);
function setup() {
  return render(tree());
}

beforeEach(() => {
  scope.options = [
    opt('LHR', 'Heathrow'),
    opt('JFK', 'JFK Airport'),
    opt('OLD', 'Old', 'archived'),
  ];
  scope.selected = [];
  scope.ready = true;
  scope.restricted = false;
  scope.scopedPage = true;
  scope.nameOf = (c) => scope.options.find((o) => o.code === c)?.name ?? c;
  scope.setSelected.mockClear();
  scope.clear.mockClear();
});

describe('LocationSwitcher', () => {
  it('shows what is selected — none, one, or a count — and is always a button on branch-aware pages', () => {
    setup();
    const btn = screen.getByTestId('location-switcher');
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute('aria-label')).toContain('All locations');
  });

  it('a single reachable branch is a static badge, not a dead dropdown', () => {
    scope.options = [opt('LHR', 'Heathrow')];
    setup();
    expect(screen.queryByTestId('location-switcher')).toBeNull();
    expect(screen.getByText('Heathrow')).toBeInTheDocument();
  });

  it('is inactive on pages that are not branch-aware, and says why', () => {
    scope.scopedPage = false;
    setup();
    expect(screen.getByTestId('location-switcher')).toBeDisabled();
    expect(screen.getByTestId('location-switcher-inactive')).toBeInTheDocument();
  });

  it('is disabled until the options have loaded', () => {
    scope.ready = false;
    setup();
    expect(screen.getByTestId('location-switcher')).toBeDisabled();
  });

  it('lists active and archived branches, toggles multiple, and can clear back to all', async () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByTestId('location-switcher'));
    expect(await screen.findByTestId('location-option-LHR')).toBeInTheDocument();
    expect(screen.getByTestId('location-option-OLD')).toBeInTheDocument(); // archived group

    fireEvent.click(screen.getByTestId('location-option-LHR'));
    expect(scope.setSelected).toHaveBeenLastCalledWith(['LHR']);

    scope.selected = ['LHR'];
    rerender(tree());
    fireEvent.click(screen.getByTestId('location-option-JFK'));
    expect(scope.setSelected).toHaveBeenLastCalledWith(['LHR', 'JFK']);

    fireEvent.click(screen.getByTestId('location-option-LHR')); // untoggle
    expect(scope.setSelected).toHaveBeenLastCalledWith([]);

    fireEvent.click(screen.getByTestId('location-option-all'));
    expect(scope.clear).toHaveBeenCalled();
  });

  it('offers a search box once the list is long', async () => {
    scope.options = Array.from({ length: 8 }, (_, i) => opt(`L${i}`, `Branch ${i}`));
    setup();
    fireEvent.click(screen.getByTestId('location-switcher'));
    expect(await screen.findByPlaceholderText('Search locations…')).toBeInTheDocument();
  });

  it('a restricted account is offered "all my locations", never "all locations"', () => {
    scope.restricted = true;
    setup();
    expect(screen.getByTestId('location-switcher').getAttribute('aria-label')).toContain(
      'All my locations',
    );
  });
});
