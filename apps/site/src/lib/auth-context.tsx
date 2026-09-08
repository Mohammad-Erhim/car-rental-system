/**
 * Client auth context for `apps/site` — in-memory access token + silent refresh against the
 * shared API, first-party `SameSite=Lax` refresh cookie (DEC-021). Adapted from
 * `apps/web/src/lib/auth.tsx`; the customer site only ever signs in the `customer` audience.
 */
'use client';

import type { SessionResponse } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { apiFetch, registerRefreshHandler, setAccessToken } from './api-client';

type Actor = SessionResponse['actor'];

interface AuthContextValue {
  actor: Actor | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signIn: (input: { email: string; password: string }) => Promise<Actor>;
  applySession: (session: SessionResponse) => void;
  signOut: (everywhere?: boolean) => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
// MUST be localStorage, not sessionStorage — the refresh cookie is persistent + cross-tab, so a
// browser restart or a second tab would otherwise look signed-out despite a valid cookie (S7-DEF-005).
const SESSION_HINT_KEY = 'carrental.session.hint';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { locale, setLocale } = useI18n();
  const [actor, setActor] = useState<Actor | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedActorLocale = useRef<string | null>(null);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const delay = Math.max(5, expiresInSeconds - 60) * 1000;
    refreshTimer.current = setTimeout(() => {
      void doRefresh();
    }, delay);
  }, []);

  const applySession = useCallback(
    (session: SessionResponse) => {
      setAccessToken(session.accessToken);
      setActor(session.actor);
      setStatus('authenticated');
      try {
        localStorage.setItem(SESSION_HINT_KEY, '1');
      } catch {
        /* ignore */
      }
      scheduleRefresh(session.expiresInSeconds);
    },
    [scheduleRefresh],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setActor(null);
    setStatus('anonymous');
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      /* ignore */
    }
    qc.clear();
  }, [qc]);

  const doRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const session = await apiFetch<SessionResponse>('/auth/refresh', {
        method: 'POST',
        anonymous: true,
      });
      applySession(session);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    registerRefreshHandler(doRefresh);
    let hadHint = false;
    try {
      hadHint = localStorage.getItem(SESSION_HINT_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (hadHint) {
      void doRefresh().then((ok) => {
        if (!ok) setStatus('anonymous');
      });
    } else {
      setStatus('anonymous');
    }

    // S7-OPT-002 — cross-tab sync: a sign-out elsewhere clears this tab; a sign-in prompts a
    // silent refresh so a second tab adopts the session without a reload.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_HINT_KEY) return;
      if (e.newValue === '1') void doRefresh();
      else clearSession();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      registerRefreshHandler(null);
      window.removeEventListener('storage', onStorage);
    };
  }, [doRefresh, clearSession]);

  useEffect(() => {
    const next = actor && 'localeCode' in actor ? actor.localeCode : undefined;
    if (!next) {
      appliedActorLocale.current = null;
      return;
    }
    if (next !== appliedActorLocale.current) {
      appliedActorLocale.current = next;
      if (next !== locale) setLocale(next);
    }
  }, [actor, locale, setLocale]);

  const signIn: AuthContextValue['signIn'] = useCallback(
    async ({ email, password }) => {
      const session = await apiFetch<SessionResponse>('/auth/sign-in', {
        method: 'POST',
        body: { email, password, audience: 'customer' },
        anonymous: true,
      });
      applySession(session);
      return session.actor;
    },
    [applySession],
  );

  const signOut: AuthContextValue['signOut'] = useCallback(
    async (everywhere = false) => {
      try {
        await apiFetch('/auth/sign-out', { method: 'POST', body: { everywhere }, anonymous: true });
      } catch {
        /* ignore — clear locally regardless */
      }
      clearSession();
    },
    [clearSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ actor, status, signIn, applySession, signOut, refresh: doRefresh }),
    [actor, status, signIn, applySession, signOut, doRefresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
