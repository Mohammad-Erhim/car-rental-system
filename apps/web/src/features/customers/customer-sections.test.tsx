import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RestrictionsCard } from './customer-sections';

import type { CustomerRecord, CustomerRestriction } from '@/lib/admin-hooks';

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
  it('lets a different manager approve or reject a pending restriction', () => {
    manage = true;
    const onAction = show([restriction({})]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onAction.mock.calls.map((c) => c[1])).toEqual(['approve', 'reject']);
  });

  it('does not let the author approve their own restriction', () => {
    manage = true;
    show([restriction({ createdBy: 'me' })]);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('another manager must approve')).toBeInTheDocument();
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
