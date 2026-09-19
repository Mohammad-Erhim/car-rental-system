import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CaseCard, SubjectLink } from './finance-columns';

import type { RecoveryCase } from '@/lib/finance-hooks';

let canWork = true;
vi.mock('@carrental/client/react', async () => {
  const actual = await vi.importActual<object>('@carrental/client/react');
  return { ...actual, useAuth: () => ({ hasPermission: () => canWork }) };
});

const kase = (over: Partial<RecoveryCase> = {}): RecoveryCase => ({
  id: 'c1',
  kind: 'capture_failed',
  severity: 'critical',
  state: 'open',
  subjectType: 'reservation',
  subjectRef: 'RES-1',
  summary: 'Card capture failed after confirmation',
  detail: null,
  createdAt: new Date().toISOString(),
  resolvedAt: null,
  resolutionNote: null,
  ...over,
});

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );

describe('SubjectLink', () => {
  it('links a reservation and a rental to their records', () => {
    wrap(
      <>
        <SubjectLink type="reservation" reference="RES-1" />
        <SubjectLink type="rental" reference="RNT-2" />
      </>,
    );
    expect(screen.getByRole('link', { name: 'RES-1' })).toHaveAttribute('href', '/reservations/RES-1');
    expect(screen.getByRole('link', { name: 'RNT-2' })).toHaveAttribute('href', '/rentals/RNT-2');
  });

  it('shows anything else as plain text', () => {
    wrap(<SubjectLink type="payment_intent" reference="pi_1" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('pi_1')).toBeInTheDocument();
    expect(screen.getByText('payment intent')).toBeInTheDocument();
  });
});

describe('CaseCard', () => {
  it('renders the localised kind and severity, and wires retry / resolve', () => {
    canWork = true;
    const handlers = { onRetry: vi.fn(), onResolve: vi.fn(), retrying: null };
    wrap(<CaseCard c={kase()} handlers={handlers} />);
    expect(screen.getByText('Capture failed', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    fireEvent.click(screen.getByRole('button', { name: /Resolve/ }));
    expect(handlers.onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(handlers.onResolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('disables the other retries while one is in flight', () => {
    canWork = true;
    wrap(
      <CaseCard
        c={kase()}
        handlers={{ onRetry: vi.fn(), onResolve: vi.fn(), retrying: 'other' }}
      />,
    );
    expect(screen.getByRole('button', { name: /Retry/ })).toBeDisabled();
  });

  it('offers no actions without payment.reconcile', () => {
    canWork = false;
    wrap(
      <CaseCard c={kase()} handlers={{ onRetry: vi.fn(), onResolve: vi.fn(), retrying: null }} />,
    );
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });
});
