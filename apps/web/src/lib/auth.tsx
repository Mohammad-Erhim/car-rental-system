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

import { apiFetch, registerRefreshHandler, setAccessToken } from './api.js';

type Actor = SessionResponse['actor'];

interface AuthContextValue {
  actor: Actor | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signIn: (input: {
    email: string;
    password: string;
    audience?: 'customer' | 'staff';
  }) => Promise<Actor>;
  applySession: (session: SessionResponse) => void;
  signOut: (everywhere?: boolean) => Promise<void>;
  refresh: () => Promise<boolean>;
  hasPermission: (...actions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACCESS_EXP_KEY = 'carrental.session.hint';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { locale, setLocale } = useI18n();
  const [actor, setActor] = useState<Actor | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const refreshTimer = useRef<number | null>(null);
  const appliedActorLocale = useRef<string | null>(null);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    const delay = Math.max(5, expiresInSeconds - 60) * 1000;
    refreshTimer.current = window.setTimeout(() => {
      void doRefresh();
    }, delay);
  }, []);

  const applySession = useCallback(
    (session: SessionResponse) => {
      setAccessToken(session.accessToken);
      setActor(session.actor);
      setStatus('authenticated');
      try {
        sessionStorage.setItem(ACCESS_EXP_KEY, '1');
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
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    try {
      sessionStorage.removeItem(ACCESS_EXP_KEY);
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

  // on mount: restore a session only when a prior session hint exists (avoids an expected 401
  // on every fresh visit). The refresh cookie is only set after a successful sign-in/verify.
  useEffect(() => {
    registerRefreshHandler(doRefresh);
    let hadHint = false;
    try {
      hadHint = sessionStorage.getItem(ACCESS_EXP_KEY) === '1';
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
    return () => registerRefreshHandler(null);
  }, [doRefresh]);

  // A signed-in actor's saved locale preference follows them across sign-ins/devices
  // (FR-IAM-006). Only push when the actor's own value changes — never fight a switcher
  // change the user made this session.
  useEffect(() => {
    const next = actor?.localeCode;
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
    async ({ email, password, audience = 'customer' }) => {
      const session = await apiFetch<SessionResponse>('/auth/sign-in', {
        method: 'POST',
        body: { email, password, audience },
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
        await apiFetch('/auth/sign-out', {
          method: 'POST',
          body: { everywhere },
          anonymous: true,
        });
      } catch {
        /* ignore — clear locally regardless */
      }
      clearSession();
    },
    [clearSession],
  );

  const hasPermission = useCallback(
    (...actions: string[]) => {
      if (!actor) return false;
      if (actor.kind !== 'staff') return false;
      return actions.some((a) => actor.permissions.includes(a));
    },
    [actor],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ actor, status, signIn, applySession, signOut, refresh: doRefresh, hasPermission }),
    [actor, status, signIn, applySession, signOut, doRefresh, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
