import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PrivacyRequestsCard, RestrictionsCard } from './customer-sections';

import type { CustomerRecord, CustomerRestriction, PrivacyRequest } from '@/lib/admin-hooks';

let manage = true;
vi.mock('@carrental/client/react', async () => {
  const actual = await vi.importActual<object>('@carrental/client/react');
  return {
    ...actual,
    useAuth: () => ({ hasPermission: () => manage, actor: { accountId: 'me' } }),
  };
});

const restriction = (over: Partial<CustomerRestriction>): CustomerRestriction => ({
  id: 'r1',
  category: 'block',
  scope: 'all',
  reasonCode: 'suspected_fraud',
  evidenceRef: null,
  status: 'pending_review',
  reviewNotes: null,
  createdBy: 'someone-else',
  approvedBy: null,
  effectiveFrom: null,
  effectiveTo: null,
  isActive: false,
  ...over,
});

const show = (rows: CustomerRestriction[]) => {
  const onAction = vi.fn();
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <RestrictionsCard r={{ restrictions: rows } as CustomerRecord} onAction={onAction} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return onAction;
};

describe('RestrictionsCard', () => {
  it('lets a manager approve or reject a pending restriction', () => {
    manage = true;
    const onAction = show([restriction({})]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onAction.mock.calls.map((c) => c[1])).toEqual(['approve', 'reject']);
  });

  it('lets the author approve their own restriction (no hard-coded second person)', () => {
    manage = true;
    const onAction = show([restriction({ createdBy: 'me' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'approve');
  });

  it('offers Lift on an active restriction', () => {
    manage = true;
    const onAction = show([restriction({ status: 'active', isActive: true })]);
    fireEvent.click(screen.getByRole('button', { name: 'Lift' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'lift');
  });

  it('shows read-only rows without customer.manage', () => {
    manage = false;
    show([restriction({})]);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('pending review')).toBeInTheDocument();
  });

  it('says so when there are none', () => {
    manage = true;
    show([]);
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});

const dataRequest = (over: Partial<PrivacyRequest>): PrivacyRequest => ({
  id: 'd1',
  kind: 'access',
  status: 'received',
  blockers: [],
  detail: 'please send my data',
  resolutionNote: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const showRequests = (rows: PrivacyRequest[]) => {
  const onAction = vi.fn();
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <PrivacyRequestsCard r={{ dataRequests: rows } as CustomerRecord} onAction={onAction} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return onAction;
};

describe('PrivacyRequestsCard', () => {
  it('lets a manager start review on a received request', () => {
    manage = true;
    const onAction = showRequests([dataRequest({})]);
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), 'review');
  });

  it('offers Complete and Reject on an in-review request', () => {
    manage = true;
    const onAction = showRequests([dataRequest({ status: 'in_review' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onAction.mock.calls.map((c) => c[1])).toEqual(['complete', 'reject']);
  });

  it('shows blockers on a blocked closure request', () => {
    manage = true;
    showRequests([
      dataRequest({
        kind: 'closure',
        status: 'blocked',
        blockers: [{ code: 'retention_period', detail: 'must be retained for a period' }],
      }),
    ]);
    expect(screen.getByText('must be retained for a period')).toBeInTheDocument();
  });

  it('offers no actions on a completed request', () => {
    manage = true;
    showRequests([dataRequest({ status: 'completed', resolutionNote: 'sent by email' })]);
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows read-only rows without customer.manage', () => {
    manage = false;
    showRequests([dataRequest({})]);
    expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
  });

  it('says so when there are none', () => {
    manage = true;
    showRequests([]);
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});
