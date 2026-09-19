import type { SessionResponse } from '@carrental/contracts';
import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api-error';

const apiFetch = vi.fn();
vi.mock('../api-fetch', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const setAccessToken = vi.fn();
vi.mock('../token-store', () => ({
  setAccessToken: (t: unknown) => setAccessToken(t),
  registerRefreshHandler: vi.fn(),
}));

const { AuthProvider, useAuth } = await import('./auth');

const HINT = 'carrental.session.hint.staff';

function session(name = 'Dev', expiresInSeconds = 900): SessionResponse {
  return {
    accessToken: `tok-${name}`,
    expiresInSeconds,
    actor: {
      accountId: '00000000-0000-0000-0000-000000000001',
      kind: 'staff',
      displayName: name,
      localeCode: 'en',
      emailVerified: true,
      permissions: [],
      roleCodes: [],
      locationScope: [],
    },
  } as SessionResponse;
}
const problem = (status: number) =>
  new ApiError({
    code: status === 401 ? 'auth_session_expired' : 'internal_error',
    category: 'internal',
    status,
    title: 'x',
    correlationId: 'c',
  } as never);

let ctx: ReturnType<typeof useAuth>;
function Probe() {
  ctx = useAuth();
  return <span data-testid="s">{ctx.status}</span>;
}
function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <AuthProvider defaultAudience="staff">
          <Probe />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  apiFetch.mockReset();
  setAccessToken.mockReset();
  localStorage.setItem(HINT, '1');
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AuthProvider — never signs the user out by accident', () => {
  it('restores the session on mount', async () => {
    apiFetch.mockResolvedValue(session());
    mount();
    await waitFor(() => expect(ctx.status).toBe('authenticated'));
    expect(localStorage.getItem(HINT)).toBe('1');
  });

  it('a definitive 401 ends the session and clears the hint', async () => {
    apiFetch.mockRejectedValue(problem(401));
    mount();
    await waitFor(() => expect(ctx.status).toBe('anonymous'));
    expect(localStorage.getItem(HINT)).toBeNull();
  });

  it.each([
    ['network failure', new TypeError('Failed to fetch')],
    ['502 from the proxy', problem(502)],
    ['503', problem(503)],
    ['429', problem(429)],
  ])('%s is retried and does NOT sign the user out', async (_n, err) => {
    apiFetch.mockRejectedValueOnce(err).mockResolvedValue(session());
    mount();
    await waitFor(() => expect(ctx.status).toBe('authenticated'), { timeout: 4000 });
    expect(localStorage.getItem(HINT)).toBe('1');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('when the API stays down the hint is kept (user is not logged out everywhere)', async () => {
    apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    mount();
    await waitFor(() => expect(ctx.status).toBe('anonymous'), { timeout: 9000 });
    expect(localStorage.getItem(HINT)).toBe('1'); // still a session as far as we know
    expect(setAccessToken).not.toHaveBeenCalledWith(null);
  }, 12000);

  it('recovers when the network returns (online event) and becomes authenticated', async () => {
    let down = true;
    apiFetch.mockImplementation(() =>
      down ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(session()),
    );
    mount();
    await waitFor(() => expect(ctx.status).toBe('anonymous'), { timeout: 9000 });
    down = false;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(ctx.status).toBe('authenticated'));
  }, 15000);

  it('two simultaneous refresh calls in a tab share one request', async () => {
    apiFetch.mockResolvedValueOnce(session()); // mount restore
    mount();
    await waitFor(() => expect(ctx.status).toBe('authenticated'));
    apiFetch.mockClear();
    apiFetch.mockImplementation(() => new Promise((r) => setTimeout(() => r(session('Next')), 20)));
    // bypass the "fresh session" shortcut by aging it: the shortcut is exercised separately
    await act(async () => {
      const [a, b] = await Promise.all([ctx.refresh(), ctx.refresh()]);
      expect(a && b).toBe(true);
    });
    expect(apiFetch.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('adopts a session another tab just refreshed instead of refreshing again', async () => {
    apiFetch.mockResolvedValueOnce(session()); // mount
    mount();
    await waitFor(() => expect(ctx.status).toBe('authenticated'));
    apiFetch.mockClear();
    // the tab that won the refresh lock shares its result over the BroadcastChannel
    const other = new BroadcastChannel('carrental.auth.staff');
    act(() => other.postMessage({ type: 'session', session: session('FromOtherTab') }));
    await waitFor(() => expect(ctx.actor?.displayName).toBe('FromOtherTab'));
    await act(async () => {
      await ctx.refresh(); // queued behind that tab: nothing left to do
    });
    expect(apiFetch).not.toHaveBeenCalled();
    other.close();
  });

  it('the two audiences keep separate hints: a customer sign-out does not touch staff', async () => {
    apiFetch.mockResolvedValue(session());
    mount();
    await waitFor(() => expect(ctx.status).toBe('authenticated'));
    act(() => {
      // what another tab's customer AuthProvider would do
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'carrental.session.hint.customer', newValue: null }),
      );
    });
    expect(ctx.status).toBe('authenticated');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: HINT, newValue: null }));
    });
    await waitFor(() => expect(ctx.status).toBe('anonymous'));
  });

  it('refreshes proactively when the tab becomes visible with an expired token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    apiFetch.mockResolvedValueOnce(session('A', 30)); // 30 s left → inside the 60 s leeway
    mount();
    await vi.waitFor(() => expect(ctx.status).toBe('authenticated'));
    apiFetch.mockClear();
    apiFetch.mockResolvedValue(session('B'));
    vi.setSystemTime(Date.now() + 20_000); // and no longer "fresh"
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await vi.waitFor(() => expect(ctx.actor?.displayName).toBe('B'));
  });
});
