import { I18nProvider } from '@carrental/i18n/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksBell } from './tasks-bell';

const count = vi.fn();
vi.mock('@/lib/workflow-hooks', () => ({ useTaskCount: () => count() }));
vi.mock('@carrental/client/react', () => ({ useAuth: () => ({ actor: { kind: 'staff' } }) }));

const show = () =>
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <TasksBell />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('TasksBell', () => {
  beforeEach(() => count.mockReset());

  it('shows how many tasks are waiting and links to the task list', () => {
    count.mockReturnValue({ data: { pending: 3, overdue: 0 } });
    show();
    expect(screen.getByTestId('tasks-bell-count')).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: '3 tasks waiting for you' })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });

  it('shows no count when nothing is waiting', () => {
    count.mockReturnValue({ data: { pending: 0, overdue: 0 } });
    show();
    expect(screen.queryByTestId('tasks-bell-count')).toBeNull();
    expect(screen.getByRole('link', { name: 'No tasks waiting for you' })).toBeInTheDocument();
  });

  it('caps a very large count', () => {
    count.mockReturnValue({ data: { pending: 250, overdue: 2 } });
    show();
    expect(screen.getByTestId('tasks-bell-count')).toHaveTextContent('99+');
  });
});
