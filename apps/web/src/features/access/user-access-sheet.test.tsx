import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as Hooks from '@/lib/access-hooks';

const access: Hooks.StaffAccess = {
  staff: {
    accountId: 'u1',
    displayName: 'Ana Agent',
    email: 'ana@example.test',
    status: 'active',
    accountStatus: 'active',
    locationScope: [],
  },
  assignments: [
    {
      id: 'a1',
      roleCode: 'agent',
      roleName: 'Rental agent',
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: null,
      reason: null,
      state: 'active',
    },
    {
      id: 'a2',
      roleCode: 'cover',
      roleName: 'Cover',
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2030-01-01T00:00:00Z',
      reason: 'holiday',
      state: 'active',
    },
  ],
  overrides: [
    {
      id: 'o1',
      action: 'fleet.read',
      effect: 'deny',
      validUntil: null,
      reason: 'audit',
      expired: false,
    },
  ],
  groups: [{ code: 'desk', name: 'Front desk' }],
  effective: {
    roleCodes: ['agent'],
    permissions: ['reservation.read', 'payment.refund'],
    denied: ['fleet.read'],
    conditions: { 'payment.refund': { amountMinorMax: 5000 } },
    sources: {
      'reservation.read': [{ kind: 'role', code: 'agent', name: 'Rental agent', validUntil: null }],
      'payment.refund': [{ kind: 'role', code: 'agent', name: 'Rental agent', validUntil: null }],
      'fleet.read': [{ kind: 'override', effect: 'deny', validUntil: null, reason: 'audit' }],
    },
  },
};
const removeRole = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/access-hooks', async (orig) => ({
  ...(await orig<typeof Hooks>()),
  useStaffAccess: () => ({ data: access, isLoading: false, isError: false }),
  useRoles: () => ({
    data: {
      roles: [],
      permissionActions: [
        {
          code: 'reservation.read',
          group: 'reservation',
          riskLevel: 'normal',
          description: 'Read',
        },
        { code: 'payment.refund', group: 'payment', riskLevel: 'high', description: 'Refund' },
        { code: 'fleet.read', group: 'fleet', riskLevel: 'normal', description: 'Fleet' },
      ],
    },
  }),
  useAssignRole: () => ({ mutateAsync: vi.fn() }),
  useSetOverride: () => ({ mutateAsync: vi.fn() }),
  useRemoveOverride: () => ({ mutateAsync: vi.fn() }),
  useRemoveAssignment: () => ({ mutateAsync: removeRole }),
}));

const { UserAccessSheet } = await import('./user-access-sheet');

const show = () =>
  render(
    <I18nProvider initialLocale="en">
      <UserAccessSheet accountId="u1" open onOpenChange={() => {}} />
    </I18nProvider>,
  );

describe('UserAccessSheet', () => {
  it('shows the person, their roles (permanent and time-bound), exceptions and teams', () => {
    show();
    expect(screen.getByText('Ana Agent')).toBeInTheDocument();
    expect(screen.getByText('Rental agent', { selector: 'p.font-medium' })).toBeInTheDocument();
    expect(screen.getByText(/until removed/i)).toBeInTheDocument();
    expect(screen.getByText(/until .*2030/i)).toBeInTheDocument();
    expect(screen.getByText('Front desk')).toBeInTheDocument();
    expect(screen.getAllByText('fleet.read').length).toBeGreaterThan(0);
  });

  it('spells out what it all adds up to: permissions with their source, limits and denials', () => {
    show();
    const effective = screen
      .getByRole('heading', { name: /what they can do now/i })
      .closest('section')!;
    expect(effective.textContent).toContain('reservation.read');
    expect(effective.textContent).toContain('denied');
    expect(effective.textContent).toMatch(/up to 50/);
  });

  it('removing a role asks first, then removes it', async () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove role' })[0]!);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove role', hidden: false }).then((b) => b),
    );
    await waitFor(() => expect(removeRole).toHaveBeenCalledWith({ accountId: 'u1', id: 'a1' }));
  });
});
