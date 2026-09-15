import { I18nProvider } from '@carrental/i18n/react';
import { ToastProvider } from '@carrental/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepUpProvider } from '../../lib/step-up.js';

import { PaymentsPage } from './payments-page.js';

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
});

function renderPage() {
  const qc = new QueryClient();
  return render(
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <StepUpProvider>
            <PaymentsPage />
          </StepUpProvider>
        </ToastProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('PaymentsPage — save test keys (regression)', () => {
  it('sends the secret key on first-time entry (test.configured: false, never clicked "Replace key")', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          activeDriver: 'simulator',
          updatedAt: null,
          test: {
            configured: false,
            publishableKey: null,
            secretKeyLast4: null,
            webhookConfigured: false,
          },
          live: {
            configured: false,
            publishableKey: null,
            secretKeyLast4: null,
            webhookConfigured: false,
          },
        }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          activeDriver: 'simulator',
          updatedAt: null,
          test: {
            configured: true,
            publishableKey: 'pk_test_1',
            secretKeyLast4: '1234',
            webhookConfigured: false,
          },
          live: {
            configured: false,
            publishableKey: null,
            secretKeyLast4: null,
            webhookConfigured: false,
          },
        }),
    });
    // any further refetches after the PUT succeeds (query invalidation) get a stable response
    // instead of undefined, so they don't throw and spam unrelated noise into this test.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          activeDriver: 'simulator',
          updatedAt: null,
          test: {
            configured: true,
            publishableKey: 'pk_test_1',
            secretKeyLast4: '1234',
            webhookConfigured: false,
          },
          live: {
            configured: false,
            publishableKey: null,
            secretKeyLast4: null,
            webhookConfigured: false,
          },
        }),
    });

    renderPage();

    await screen.findByTestId('pay-test-publishable');
    // note: no "Replace key" click here — the field is a not-yet-configured, directly-editable
    // PasswordInput (SecretField renders that whenever `configured` is false), which is the
    // real-world path that used to silently drop the typed secret.
    fireEvent.change(screen.getByTestId('pay-test-publishable'), {
      target: { value: 'pk_test_1' },
    });
    fireEvent.change(screen.getByTestId('pay-test-secret'), {
      target: { value: 'sk_test_real_value' },
    });
    fireEvent.click(screen.getByTestId('pay-save-test'));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT'),
      ).toBe(true),
    );
    const putCall = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT',
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.test.secretKey).toBe('sk_test_real_value');
  });
});
