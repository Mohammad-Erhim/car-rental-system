import type { SessionResponse } from '@carrental/contracts';
import { I18nProvider, useI18n } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The actor-locale-follow effect calls apiFetch('/auth/refresh'); stub the network + token store.
const refresh = vi.fn<() => Promise<SessionResponse>>();
vi.mock('../api-fetch', () => ({
  apiFetch: (path: string) => {
    if (path === '/auth/refresh') return refresh();
    throw new Error(`unexpected apiFetch ${path}`);
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock('../token-store', () => ({
  setAccessToken: vi.fn(),
  registerRefreshHandler: vi.fn(),
}));

const { AuthProvider } = await import('./auth');

function session(localeCode: string): SessionResponse {
  return {
    accessToken: 't',
    expiresInSeconds: 900,
    actor: {
      accountId: '00000000-0000-0000-0000-000000000001',
      kind: 'staff',
      displayName: 'Dev',
      localeCode,
      emailVerified: true,
      permissions: [],
      roleCodes: [],
      locationScope: [],
    },
  };
}

let seenLocale = '';
function LocaleProbe() {
  const { locale } = useI18n();
  useEffect(() => {
    seenLocale = locale;
  });
  return null;
}

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {/* apps/web seeds initialLocale from the stored switcher choice (detectInitialLocale) */}
      <I18nProvider
        initialLocale={localStorage.getItem('carrental.locale') ?? undefined}
        onLocaleChange={(l) => localStorage.setItem('carrental.locale', l)}
      >
        <AuthProvider defaultAudience="staff">
          <LocaleProbe />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  refresh.mockReset();
  seenLocale = '';
  localStorage.setItem('carrental.session.hint', '1'); // there is a session to restore
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider — following the actor locale (FR-IAM-006)', () => {
  it('adopts the account locale on a first sign-in (no local preference yet)', async () => {
    refresh.mockResolvedValue(session('fr'));
    mount();
    await waitFor(() => expect(seenLocale).toBe('fr'));
    expect(localStorage.getItem('carrental.locale.fromActor')).toBe('fr');
  });

  it('does NOT re-assert the account locale over a switcher choice on reload', async () => {
    // an earlier session applied the account default 'en'; this session the user switched to 'ar'
    // (persisted by the i18n provider's onLocaleChange).
    localStorage.setItem('carrental.locale.fromActor', 'en');
    localStorage.setItem('carrental.locale', 'ar');
    refresh.mockResolvedValue(session('en'));
    mount();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(seenLocale).toBe('ar'); // the switcher's choice survives the reload
    expect(localStorage.getItem('carrental.locale')).toBe('ar');
  });

  it('applies a genuinely changed account locale (e.g. updated in profile)', async () => {
    localStorage.setItem('carrental.locale.fromActor', 'en');
    localStorage.setItem('carrental.locale', 'en');
    refresh.mockResolvedValue(session('fr')); // account default is now fr
    mount();
    await waitFor(() => expect(seenLocale).toBe('fr'));
    expect(localStorage.getItem('carrental.locale.fromActor')).toBe('fr');
  });
});
