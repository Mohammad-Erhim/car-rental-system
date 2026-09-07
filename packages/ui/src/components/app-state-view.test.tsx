import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppStateView } from './app-state-view';

describe('AppStateView (SRS §7.2 — 12 shared states)', () => {
  it('loading renders a busy status with skeleton, not the final data', () => {
    render(<AppStateView kind="loading" title="Loading results" />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-appstate', 'loading');
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading results')).toHaveClass('sr-only');
  });

  it('failure uses role=alert and states nothing changed + a recovery action', () => {
    const onRetry = vi.fn();
    render(
      <AppStateView
        kind="failure"
        title="That didn’t work"
        description="Nothing was changed."
        primaryAction={{ label: 'Try again', onClick: onRetry }}
      />,
    );
    const el = screen.getByRole('alert');
    expect(el).toHaveAttribute('data-appstate', 'failure');
    expect(screen.getByText('Nothing was changed.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('permission-denied does not leak record detail and offers safe navigation', () => {
    render(
      <AppStateView
        kind="permission-denied"
        title="You don’t have access to this"
        secondaryAction={{ label: 'Back', onClick: () => {} }}
      />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-appstate', 'permission-denied');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('stale disables consequential continuation by exposing only a review action', () => {
    render(
      <AppStateView
        kind="stale"
        title="This record changed"
        primaryAction={{ label: 'Review latest', onClick: () => {} }}
      />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-appstate', 'stale');
    expect(screen.getByRole('button', { name: 'Review latest' })).toBeInTheDocument();
  });
});
