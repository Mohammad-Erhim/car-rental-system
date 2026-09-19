import { ApiError } from '@carrental/client';
import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const clear = vi.fn();
const retry = vi.fn();
vi.mock('@/lib/location-scope', () => ({ useLocationScope: () => ({ clear, retry }) }));

const { ListError } = await import('./list-error');

const problem = (status: number, title: string) =>
  new ApiError({
    code: status === 403 ? 'forbidden' : 'internal_error',
    category: 'internal',
    status,
    title,
    correlationId: 'c',
  } as never);

const setup = (error: unknown, onRetry = vi.fn()) => {
  render(
    <I18nProvider initialLocale="en">
      <ListError error={error} title="Couldn't load" onRetry={onRetry} />
    </I18nProvider>,
  );
  return onRetry;
};

describe('ListError', () => {
  it('a 403 shows the API’s reason and offers to reset the location filter — retrying cannot help', () => {
    const onRetry = setup(problem(403, 'You don\'t have access to location "JFK".'));
    expect(screen.getByText('You don\'t have access to location "JFK".')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all my locations' }));
    expect(clear).toHaveBeenCalled();
    expect(retry).toHaveBeenCalled(); // re-reads the account's current locations too
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('anything else is a normal retryable error', () => {
    const onRetry = setup(problem(500, 'boom'));
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
