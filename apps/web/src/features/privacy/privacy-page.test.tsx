import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivacyPage } from './privacy-page';

import type { PrivacyRequestRow } from '@/lib/privacy-hooks';

const state = vi.hoisted(() => ({
  canManage: true,
  items: [] as unknown[],
  review: vi.fn(),
  complete: vi.fn(),
  reject: vi.fn(),
}));

// only the permission check is faked; the table, dialogs and form machinery are the real thing
vi.mock('@carrental/client/react', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@carrental/client/react')),
  useAuth: () => ({ hasPermission: () => state.canManage }),
}));

vi.mock('@/lib/privacy-hooks', () => ({
  usePrivacyRequests: () => ({
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    data: { items: state.items, total: state.items.length, page: 1, pageSize: 25 },
  }),
  usePrivacyRequest: () => ({
    data: {
      exportSummary: {
        reservations: 3,
        rentals: 1,
        payments: 3,
        invoices: 2,
        drivers: 1,
        messages: 9,
      },
    },
  }),
  useReviewPrivacyRequest: () => ({
    mutateAsync: state.review,
    isPending: false,
    variables: undefined,
  }),
  useCompletePrivacyRequest: () => ({ mutateAsync: state.complete, isPending: false }),
  useRejectPrivacyRequest: () => ({ mutateAsync: state.reject, isPending: false }),
}));

const row = (over: Partial<PrivacyRequestRow> = {}): PrivacyRequestRow => ({
  id: 'r1',
  kind: 'access',
  status: 'received',
  blockers: [],
  detail: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  dueAt: '2026-10-01T10:00:00.000Z',
  overdue: false,
  exportReady: false,
  customer: { accountId: 'a1', name: 'Dana Customer', email: 'da***@example.test' },
  ...over,
});

const renderPage = () =>
  render(
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PrivacyPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  state.canManage = true;
  state.items = [];
  state.review.mockReset().mockResolvedValue({});
  state.complete.mockReset().mockResolvedValue({});
  state.reject.mockReset().mockResolvedValue({});
});

// each request renders twice (table + phone card, one hidden by CSS in a real browser) — scope to one
const inTable = () => within(screen.getByTestId('privacy-rows'));

describe('the privacy queue', () => {
  it('shows who asked, what, where it stands and when a reply is due — the address masked', () => {
    state.items = [row({ overdue: true })];
    renderPage();
    const t = inTable();
    expect(t.getByText('Dana Customer')).toBeInTheDocument();
    expect(t.getByText('da***@example.test')).toBeInTheDocument();
    expect(t.getByText('Copy of data')).toBeInTheDocument();
    expect(t.getByText('Received')).toBeInTheDocument();
    expect(t.getByText('Overdue')).toBeInTheDocument();
  });

  it('says what blocks a blocked closure, in words', () => {
    state.items = [
      row({
        kind: 'closure',
        status: 'blocked',
        blockers: [{ code: 'open_reservations', detail: 'x', count: 2 }],
      }),
    ];
    renderPage();
    expect(
      inTable().getByText(
        '2 current or upcoming reservations must be completed or cancelled first.',
      ),
    ).toBeInTheDocument();
  });

  it('a finished request shows the reply it was given, and offers no actions', () => {
    state.items = [row({ status: 'rejected', resolutionNote: 'We could not verify who you are' })];
    renderPage();
    expect(inTable().getByText('We could not verify who you are')).toBeInTheDocument();
    expect(inTable().queryByRole('button')).toBeNull();
  });

  it('staff who can only READ customers see the queue and no actions', () => {
    state.canManage = false;
    state.items = [row(), row({ id: 'r2', status: 'in_review' })];
    renderPage();
    expect(inTable().getAllByText('Dana Customer')).toHaveLength(2);
    expect(inTable().queryByRole('button')).toBeNull();
  });

  it('offers review, complete and reject on a new request — and no second review once it is in review', () => {
    state.items = [row(), row({ id: 'r2', status: 'in_review' })];
    renderPage();
    expect(inTable().getByTestId('privacy-review-r1')).toBeInTheDocument();
    expect(inTable().getByTestId('privacy-complete-r1')).toBeInTheDocument();
    expect(inTable().getByTestId('privacy-reject-r1')).toBeInTheDocument();
    expect(inTable().queryByTestId('privacy-review-r2')).toBeNull();
    expect(inTable().getByTestId('privacy-complete-r2')).toBeInTheDocument();
  });

  it('starting a review calls the API for that request', async () => {
    state.items = [row()];
    renderPage();
    fireEvent.click(inTable().getByTestId('privacy-review-r1'));
    await waitFor(() => expect(state.review).toHaveBeenCalledWith({ id: 'r1' }));
  });

  it('is an honest empty state when there is nothing to work', () => {
    renderPage();
    expect(screen.getAllByText('No requests here').length).toBeGreaterThan(0);
  });
});

describe('completing a request', () => {
  const open = (r: PrivacyRequestRow) => {
    state.items = [r];
    renderPage();
    fireEvent.click(inTable().getByTestId(`privacy-complete-${r.id}`));
  };

  it('an access request shows what the download will contain, and releases it', async () => {
    open(row());
    expect(await screen.findByText('Release a copy of the data')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-export-summary')).toHaveTextContent(
      'reservations: 3, rentals: 1, payments: 3, invoices: 2, saved drivers: 1, messages: 9',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Release the data' }));
    await waitFor(() => expect(state.complete).toHaveBeenCalledWith({ id: 'r1', note: undefined }));
  });

  it('a correction cannot be completed without saying what was corrected', async () => {
    open(row({ kind: 'correction' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete request' }));
    expect(await screen.findByText('Add a short note of what was corrected')).toBeInTheDocument();
    expect(state.complete).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('privacy-note'), {
      target: { value: 'Fixed the surname' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete request' }));
    await waitFor(() =>
      expect(state.complete).toHaveBeenCalledWith({ id: 'r1', note: 'Fixed the surname' }),
    );
  });

  it('a closure spells out what is erased and what is kept before it can be confirmed', async () => {
    open(row({ kind: 'closure', detail: 'Please close my account, I have moved abroad' }));
    expect(await screen.findByRole('heading', { name: 'Close this account' })).toBeInTheDocument();
    expect(screen.getByText('Please close my account, I have moved abroad')).toBeInTheDocument(); // what they wrote
    const warning = screen.getByTestId('privacy-erase-warning');
    expect(warning).toHaveTextContent('Erased: sign-in and contact details');
    expect(warning).toHaveTextContent(
      'Kept for the legal retention period: reservations, rentals, invoices and payments',
    );
    const confirm = screen.getByRole('button', { name: 'Close account and erase data' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(state.complete).toHaveBeenCalledWith({ id: 'r1', note: undefined }));
  });

  it('a closure with open activity cannot be confirmed at all — and the dialog says why', async () => {
    open(
      row({
        kind: 'closure',
        status: 'blocked',
        blockers: [{ code: 'open_payment_issues', detail: 'x', count: 1 }],
      }),
    );
    const blocked = await screen.findByTestId('privacy-blocked');
    expect(blocked).toHaveTextContent('1 payment issue is still being resolved.');
    expect(screen.queryByTestId('privacy-erase-warning')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close account and erase data' })).toBeDisabled();
    expect(state.complete).not.toHaveBeenCalled();
  });
});

describe('rejecting a request', () => {
  it('needs a reason the customer can read', async () => {
    state.items = [row({ detail: 'Send me everything' })];
    renderPage();
    fireEvent.click(inTable().getByTestId('privacy-reject-r1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reject request' }));
    expect(await screen.findByText('Give a reason the customer can read')).toBeInTheDocument();
    expect(state.reject).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('privacy-reason'), {
      target: { value: 'We could not verify who you are' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));
    await waitFor(() =>
      expect(state.reject).toHaveBeenCalledWith({
        id: 'r1',
        note: 'We could not verify who you are',
      }),
    );
  });
});
