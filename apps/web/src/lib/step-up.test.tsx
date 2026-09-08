import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
let registered: (() => Promise<boolean>) | null = null;

vi.mock('./api.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class ApiError extends Error {},
  registerStepUpHandler: (fn: (() => Promise<boolean>) | null) => {
    registered = fn;
  },
}));

// imported after the mock is in place
const { StepUpProvider } = await import('./step-up.js');

function wrap() {
  return render(
    <I18nProvider initialLocale="en">
      <StepUpProvider>
        <div>app</div>
      </StepUpProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  apiFetch.mockReset();
  registered = null;
});

describe('StepUpProvider (SRS-SEC-014)', () => {
  it('registers a handler that opens the dialog and resolves true after a correct password', async () => {
    wrap();
    expect(registered).toBeTypeOf('function');
    expect(screen.queryByTestId('step-up-dialog')).not.toBeInTheDocument();

    apiFetch.mockResolvedValueOnce({ ok: true });
    const pending = registered!();

    await screen.findByTestId('step-up-dialog');
    fireEvent.change(screen.getByTestId('step-up-password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByTestId('step-up-submit'));

    await expect(pending).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/auth/step-up', {
      method: 'POST',
      body: { password: 'hunter2' },
    });
    await waitFor(() => expect(screen.queryByTestId('step-up-dialog')).not.toBeInTheDocument());
  });

  it('resolves false when the dialog is dismissed', async () => {
    wrap();
    const pending = registered!();
    await screen.findByTestId('step-up-dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(pending).resolves.toBe(false);
  });
});
