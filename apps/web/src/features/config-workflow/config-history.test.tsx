import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ConfigHistory } from './config-history';

import type { ConfigVersion } from '@/lib/admin-hooks';

const version = (over: Partial<ConfigVersion>): ConfigVersion => ({
  id: 'v1',
  kind: 'policy',
  key: 'cancellation',
  revision: 3,
  state: 'draft',
  payload: { freeCancelHours: 24 },
  note: null,
  createdBy: 'me',
  approvedBy: null,
  effectiveFrom: null,
  createdAt: '2026-09-01T10:00:00Z',
  ...over,
});

const show = (versions: ConfigVersion[], canPublish = true) => {
  const onAction = vi.fn().mockResolvedValue(undefined);
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <ConfigHistory versions={versions} canPublish={canPublish} onAction={onAction} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return onAction;
};

describe('ConfigHistory — publish without a second person', () => {
  it('a draft can be published straight away (and still submitted for review)', async () => {
    const onAction = show([version({})]);
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('publish-3'));
    // the confirmation shows what goes live; confirming publishes it
    const confirm = await screen.findByRole('button', { name: 'Publish' });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({ id: 'v1', action: 'approve', note: undefined }),
    );
  });

  it('a draft can be submitted for review instead', async () => {
    const onAction = show([version({})]);
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({ id: 'v1', action: 'submit', note: undefined }),
    );
  });

  it('a revision in review is approved or rejected — no "different reviewer" gate in the UI', () => {
    show([version({ state: 'in_review', createdBy: 'me' })]);
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
  });

  it('without config.publish there are no actions at all', () => {
    show([version({})], false);
    expect(screen.queryByTestId('publish-3')).toBeNull();
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull();
  });
});

describe('ConfigHistory — waiting on an approval pipeline', () => {
  const pending = {
    instanceId: 'wf-1',
    actionKey: 'config.version.publish',
    status: 'running' as const,
    definitionName: 'Two-person review',
    stepId: 'review',
    stepName: 'Second-person review',
    waitingFor: ['Test Manager'],
    waitingForMore: 0,
    dueAt: null,
    revision: 1,
  };

  it('shows who it is waiting for and offers no publish / approve / reject controls', () => {
    show([version({ state: 'in_review', workflow: pending })]);
    expect(screen.getByTestId('workflow-badge')).toHaveTextContent(/Test Manager/);
    expect(screen.getByTestId('workflow-badge')).toHaveAttribute('href', '/tasks/wf-1');
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
    expect(screen.queryByTestId('publish-3')).toBeNull();
  });

  it('a revision in review with no request behind it keeps its approve / reject buttons', () => {
    show([version({ state: 'in_review', workflow: null })]);
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });
});
