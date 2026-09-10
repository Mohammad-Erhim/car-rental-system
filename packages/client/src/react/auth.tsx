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

import { apiFetch } from '../api-fetch';
import { registerRefreshHandler, setAccessToken } from '../token-store';

type Actor = SessionResponse['actor'];
type Audience = 'customer' | 'staff';

export interface AuthContextValue {
  actor: Actor | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signIn: (input: { email: string; password: string; audience?: Audience }) => Promise<Actor>;
  applySession: (session: SessionResponse) => void;
  signOut: (everywhere?: boolean) => Promise<void>;
  refresh: () => Promise<boolean>;
  /** Staff permission check. Always false for a customer actor. */
  hasPermission: (...actions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// MUST be localStorage, not sessionStorage: the refresh cookie is persistent (survives a browser
// restart) and shared across tabs, so this "there is a session" hint has to be too — otherwise a
// restart or a second tab looks signed-out despite a valid cookie (S7-DEF-005).
const SESSION_HINT_KEY = 'carrental.session.hint';
// The actor `localeCode` we last pushed into the i18n context. Persisted so "the actor's saved
// locale changed" is judged across reloads, not just within one page life — otherwise every
// refresh re-applies the account default and silently overwrites a switcher choice the user
// made this session (S7 locale-revert).
const APPLIED_ACTOR_LOCALE_KEY = 'carrental.locale.fromActor';

function readAppliedActorLocale(): string | null {
  try {
    return localStorage.getItem(APPLIED_ACTOR_LOCALE_KEY);
  } catch {
    return null;
  }
}

function writeAppliedActorLocale(locale: string): void {
  try {
    localStorage.setItem(APPLIED_ACTOR_LOCALE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export interface AuthProviderProps {
  children: ReactNode;
  /** Audience used when `signIn` is called without one. `apps/site` → 'customer'; ops → 'staff'. */
  defaultAudience?: Audience;
  /**
   * Push the signed-in actor's saved `localeCode` into the i18n context (FR-IAM-006). Default
   * `true` — correct for the ops SPA, where the saved preference is the only locale source.
   * `apps/site` sets this `false`: there the `/{locale}/…` URL segment owns the locale, and an
   * authed customer viewing `/ar` must stay on Arabic regardless of their account default.
   */
  followActorLocale?: boolean;
}

/**
 * The shared browser auth provider: an in-memory access token, a silent refresh scheduled just
 * before expiry, a one-shot refresh on mount when a prior session hint exists, cross-tab
 * sign-in/out sync, and following the actor's saved locale (FR-IAM-006). `apps/web` and
 * `apps/site` both mount this — only `defaultAudience` and the surrounding shell differ.
 */
export function AuthProvider({
  children,
  defaultAudience = 'customer',
  followActorLocale = true,
}: AuthProviderProps) {
  const qc = useQueryClient();
  const { locale, setLocale } = useI18n();
  const [actor, setActor] = useState<Actor | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedActorLocale = useRef<string | null>(readAppliedActorLocale());
  const doRefreshRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const delay = Math.max(5, expiresInSeconds - 60) * 1000;
    refreshTimer.current = setTimeout(() => {
      void doRefreshRef.current();
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

  doRefreshRef.current = doRefresh;

  // on mount: restore a session only when a prior session hint exists (avoids an expected 401 on
  // every fresh visit). The refresh cookie is only set after a successful sign-in / verify.
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

  // A signed-in actor's saved locale preference follows them across sign-ins / devices
  // (FR-IAM-006). Only push when the actor's own value *changes* from what we last applied
  // (tracked across reloads via localStorage) — a plain refresh must not re-assert the account
  // default over a switcher choice the user made this session. Suppressed on surfaces where the
  // URL owns the locale (`followActorLocale={false}` — apps/site).
  useEffect(() => {
    const next = actor?.localeCode;
    if (!next) return;
    if (next !== appliedActorLocale.current) {
      appliedActorLocale.current = next;
      writeAppliedActorLocale(next);
      if (followActorLocale && next !== locale) setLocale(next);
    }
  }, [actor, locale, setLocale, followActorLocale]);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async ({ email, password, audience = defaultAudience }) => {
      const session = await apiFetch<SessionResponse>('/auth/sign-in', {
        method: 'POST',
        body: { email, password, audience },
        anonymous: true,
      });
      applySession(session);
      return session.actor;
    },
    [applySession, defaultAudience],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(
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

  const hasPermission = useCallback(
    (...actions: string[]) => {
      if (!actor || actor.kind !== 'staff') return false;
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
