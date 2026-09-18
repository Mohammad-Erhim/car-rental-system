import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeysSheet } from './keys-sheet';

import type { PaymentConfigSummary } from '@/lib/admin-hooks';

const fetchMock = vi.fn();
afterEach(() => {
  fetchMock.mockReset();
});

const mode = (configured: boolean) => ({
  configured,
  publishableKey: configured ? 'pk_test_1' : null,
  secretKeyLast4: configured ? '1234' : null,
  configuredAt: null,
  verifiedAt: null,
  webhookConfigured: false,
});
const config = (configured: boolean): PaymentConfigSummary => ({
  activeDriver: 'simulator',
  test: mode(configured),
  live: { ...mode(false), acknowledged: false },
  updatedAt: null,
});

const show = (cfg: PaymentConfigSummary) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="en">
        <KeysSheet mode="test" config={cfg} open onOpenChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>,
  );

const putBody = () => {
  const call = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === 'PUT',
  );
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
};

describe('KeysSheet', () => {
  it('sends the secret key typed on first-time entry', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(config(true)),
    });
    show(config(false));
    fireEvent.change(screen.getByTestId('pay-test-publishable'), {
      target: { value: 'pk_test_1' },
    });
    fireEvent.change(screen.getByTestId('pay-test-secret'), { target: { value: 'sk_test_real' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save test keys' }));
    await waitFor(() => expect(putBody()).not.toBeNull());
    expect(putBody().test).toMatchObject({
      publishableKey: 'pk_test_1',
      secretKey: 'sk_test_real',
    });
  });

  it('shows a saved secret locked, and sends nothing for it until replaced', () => {
    show(config(true));
    expect(screen.getByTestId('pay-test-secret-configured')).toHaveTextContent('••••1234');
    expect(screen.queryByTestId('pay-test-secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Replace key' })[0]!);
    expect(screen.getByTestId('pay-test-secret')).toBeInTheDocument();
  });

  it('will not save when nothing was entered', async () => {
    vi.stubGlobal('fetch', fetchMock);
    show(config(true));
    fireEvent.click(screen.getByRole('button', { name: 'Save test keys' }));
    expect(await screen.findByText('Enter at least one value to save.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
