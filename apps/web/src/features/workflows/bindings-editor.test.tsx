import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoutesEditor } from './bindings-editor';

import type { BindingRow, DefinitionRow, GovernedAction } from '@/lib/workflow-hooks';

const saveAsync = vi.fn();
const removeAsync = vi.fn();
vi.mock('@/lib/workflow-hooks', () => ({
  useSaveBinding: () => ({ mutateAsync: saveAsync, isPending: false }),
  useRemoveBinding: () => ({ mutateAsync: removeAsync, isPending: false }),
}));

const action: GovernedAction = {
  key: 'payment.refund',
  subjectType: 'reservation',
  label: 'Refund a payment',
  description: '',
  variables: ['amount', 'currency', 'location', 'initiator_roles'],
  securityCritical: false,
};
const workflows: DefinitionRow[] = [
  {
    id: 'w1',
    code: 'finance',
    name: 'Finance approval',
    description: 'Finance signs off',
    isSystem: false,
    archived: false,
    publishedRevision: 1,
    hasDraft: false,
    stepCount: 1,
    boundActions: 0,
  },
  {
    id: 'wd',
    code: 'direct',
    name: 'Direct',
    description: null,
    isSystem: true,
    archived: false,
    publishedRevision: 1,
    hasDraft: false,
    stepCount: 0,
    boundActions: 0,
  },
];
const route = (over: Partial<BindingRow>): BindingRow => ({
  id: 'b1',
  actionKey: 'payment.refund',
  definitionId: 'w1',
  definitionName: 'Finance approval',
  condition: { '>': [{ var: 'amount' }, 500] },
  priority: 10,
  active: true,
  label: 'Large refunds',
  ...over,
});
const show = (routes: BindingRow[], canManage = true) =>
  render(
    <I18nProvider initialLocale="en">
      <RoutesEditor action={action} routes={routes} workflows={workflows} canManage={canManage} />
    </I18nProvider>,
  );

describe('RoutesEditor', () => {
  beforeEach(() => {
    saveAsync.mockReset().mockResolvedValue({});
    removeAsync.mockReset().mockResolvedValue({});
  });

  it('lists routes highest priority first, with their condition in plain words', () => {
    show([route({ id: 'lo', label: 'Everything else', condition: null, priority: 1 }), route({})]);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Large refunds');
    expect(items[0]).toHaveTextContent('amount > 500');
    expect(items[1]).toHaveTextContent('always');
  });

  it('says so when there are no routes, and hides the controls without permission', () => {
    show([], false);
    expect(screen.getByText(/No routes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a route' })).toBeNull();
  });

  it('adds a route from a rule and a workflow — never offering the built-in Direct as a target', async () => {
    show([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add a route' }));
    expect(screen.queryByRole('radio', { name: /^Direct/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'more than' }));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('route-save'));
    await waitFor(() => expect(saveAsync).toHaveBeenCalled());
    expect(saveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'payment.refund',
        definitionId: 'w1',
        condition: { '>': [{ var: 'amount' }, 500] },
      }),
    );
  });

  it('moving a route swaps priorities with its neighbour', async () => {
    show([
      route({ id: 'a', priority: 20, label: 'A' }),
      route({ id: 'b', priority: 10, label: 'B' }),
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!); // B up
    await waitFor(() => expect(saveAsync).toHaveBeenCalledTimes(2));
    const calls = saveAsync.mock.calls.map((c) => c[0] as { id: string; priority: number });
    expect(calls.find((c) => c.id === 'b')!.priority).toBeGreaterThan(
      calls.find((c) => c.id === 'a')!.priority,
    );
  });

  it('removing a route asks first', async () => {
    show([route({})]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove route' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove route', hidden: false }));
    await waitFor(() => expect(removeAsync).toHaveBeenCalledWith('b1'));
  });
});
