import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Hooks from '@/lib/access-hooks';

const catalogue = [
  { code: 'a.read', group: 'a', riskLevel: 'normal', description: 'Read a' },
  { code: 'a.write', group: 'a', riskLevel: 'high', description: 'Write a' },
];
const role = (code: string, actions: string[], locked = false, holders = 2): Hooks.RoleRow => ({
  id: code,
  code,
  name: code === 'sys' ? 'System role' : 'Desk lead',
  description: null,
  isSystem: locked,
  locked,
  archived: false,
  permissionActions: actions,
  conditions: {},
  holderCount: holders,
  version: 1,
});
const data = {
  roles: [role('sys', ['*'], true), role('lead', ['a.read'])],
  permissionActions: catalogue,
};
const applyMatrix = vi.fn();

vi.mock('@/lib/access-hooks', async (orig) => ({
  ...(await orig<typeof Hooks>()),
  useRoles: () => ({ data, isLoading: false, isError: false, refetch: vi.fn() }),
  useArchiveRole: () => ({ mutateAsync: vi.fn() }),
  useSaveRole: () => ({ mutateAsync: vi.fn() }),
  useCloneRole: () => ({ mutateAsync: vi.fn() }),
  useWhoCan: () => ({ data: [], isLoading: false, isError: false }),
  useApplyMatrix: () => ({ mutateAsync: applyMatrix }),
}));

const { RolesTab } = await import('./roles-tab');

const show = () =>
  render(
    <I18nProvider initialLocale="en">
      <RolesTab />
    </I18nProvider>,
  );

beforeEach(() => {
  applyMatrix.mockReset();
  applyMatrix.mockImplementation(async (v: { dryRun?: boolean }) => ({
    applied: !v.dryRun,
    changes: [{ roleCode: 'lead', added: ['a.write'], removed: [], affectedStaff: 2 }],
  }));
});

describe('RolesTab', () => {
  it('shows every permission grouped, with system roles locked', () => {
    show();
    expect(screen.getByTestId('roles-matrix')).toBeInTheDocument();
    expect(screen.getAllByText('a.write').length).toBeGreaterThan(0);
    // the system role's cells cannot be edited
    expect(screen.getByTestId('cell-sys-a.read')).toBeDisabled();
    expect(screen.getByTestId('cell-lead-a.read')).not.toBeDisabled();
  });

  it('editing a cell stages a change; nothing is saved until it is reviewed and confirmed', async () => {
    show();
    expect(screen.queryByTestId('matrix-pending')).toBeNull();
    fireEvent.click(screen.getByTestId('cell-lead-a.write'));
    expect(screen.getByTestId('matrix-pending')).toBeInTheDocument();
    expect(applyMatrix).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('matrix-review'));
    // the dry run asks the API what would change — without applying
    await waitFor(() =>
      expect(applyMatrix).toHaveBeenCalledWith({
        dryRun: true,
        changes: [{ roleCode: 'lead', add: ['a.write'], remove: [] }],
      }),
    );
    const body = await screen.findByTestId('matrix-review-body');
    expect(body.textContent).toContain('a.write');
    expect(screen.getByText(/affects 2 people/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('matrix-apply'));
    await waitFor(() =>
      expect(applyMatrix).toHaveBeenLastCalledWith({
        changes: [{ roleCode: 'lead', add: ['a.write'], remove: [] }],
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('matrix-pending')).toBeNull());
  });

  it('toggling a staged cell back cancels the change', () => {
    show();
    fireEvent.click(screen.getByTestId('cell-lead-a.write'));
    expect(screen.getByTestId('matrix-pending')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cell-lead-a.write'));
    expect(screen.queryByTestId('matrix-pending')).toBeNull();
  });

  it('Discard throws the staged edits away', () => {
    show();
    fireEvent.click(screen.getByTestId('cell-lead-a.write'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('matrix-pending')).toBeNull();
  });

  it('filters the permission rows by search', () => {
    show();
    fireEvent.change(screen.getByLabelText('Search permissions…'), { target: { value: 'write' } });
    expect(screen.queryByTestId('cell-lead-a.read')).toBeNull();
    expect(screen.getByTestId('cell-lead-a.write')).toBeInTheDocument();
  });
});
