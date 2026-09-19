import { ApiError } from '@carrental/client';
import type { SessionResponse } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { AppState, type AppStateStatus } from 'react-native';

import { apiFetch } from '../api/api-fetch';
import { clearAuthCookies } from '../api/cookies';
import {
  getAccessTokenExpiresAt,
  registerRefreshHandler,
  setAccessToken,
} from '../api/token-store';

type Actor = SessionResponse['actor'];
type Audience = 'customer' | 'staff';

export interface AuthContextValue {
  actor: Actor | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signIn: (input: { email: string; password: string; audience?: Audience }) => Promise<Actor>;
  applySession: (session: SessionResponse) => void;
  signOut: (everywhere?: boolean) => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Mirrors `@carrental/client`'s web auth provider (SESSION_HINT_KEY): a non-secret flag so a
// fresh launch only attempts a silent refresh when a prior session plausibly exists, instead of
// firing an expected-401 request on every cold start. The real credential is the httpOnly
// refresh cookie sitting in the native cookie jar — this key never holds anything sensitive.
const SESSION_HINT_KEY = 'carrental.session.hint';
const APPLIED_ACTOR_LOCALE_KEY = 'carrental.locale.fromActor';

export interface AuthProviderProps {
  children: ReactNode;
  defaultAudience?: Audience;
}

/**
 * RN counterpart of `@carrental/client/react`'s `AuthProvider` — same session model (in-memory
 * access token, cookie-held refresh token, one silent refresh on launch, a timer just before
 * expiry) plus one thing the web version doesn't need: an `AppState` listener that re-checks on
 * foreground-resume, because RN suspends JS timers while backgrounded so the scheduled refresh
 * silently misses its window whenever the app spends more than a few minutes backgrounded.
 */
export function AuthProvider({ children, defaultAudience = 'customer' }: AuthProviderProps) {
  const qc = useQueryClient();
  const { locale, setLocale } = useI18n();
  const [actor, setActor] = useState<Actor | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedActorLocale = useRef<string | null>(null);
  const doRefreshRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  useEffect(() => {
    AsyncStorage.getItem(APPLIED_ACTOR_LOCALE_KEY).then((v) => {
      appliedActorLocale.current = v;
    });
  }, []);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const delay = Math.max(5, expiresInSeconds - 60) * 1000;
    refreshTimer.current = setTimeout(() => {
      void doRefreshRef.current();
    }, delay);
  }, []);

  const applySession = useCallback(
    (session: SessionResponse) => {
      setAccessToken(session.accessToken, session.expiresInSeconds);
      setActor(session.actor);
      setStatus('authenticated');
      void AsyncStorage.setItem(SESSION_HINT_KEY, '1');
      scheduleRefresh(session.expiresInSeconds);
    },
    [scheduleRefresh],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setActor(null);
    setStatus('anonymous');
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    void AsyncStorage.removeItem(SESSION_HINT_KEY);
    qc.clear();
  }, [qc]);

  // Same contract as `@carrental/client`'s web provider: only the API answering 401 ends the
  // session. A dropped connection, a 5xx, a 429 or a tunnel/elevator is retried and the user stays
  // signed in (the foreground-resume check below picks it up again).
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const doRefresh = useCallback((): Promise<boolean> => {
    refreshInFlight.current ??= (async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const session = await apiFetch<SessionResponse>('/auth/refresh', {
              method: 'POST',
              anonymous: true,
            });
            applySession(session);
            return true;
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              clearSession();
              return false;
            }
            const delay = [400, 1200, 3000][attempt];
            if (delay === undefined) {
              // unavailable, not logged out: keep the hint, let resume/next call retry
              setStatus((s) => (s === 'loading' ? 'anonymous' : s));
              const expiresAt = getAccessTokenExpiresAt();
              return expiresAt !== null && expiresAt - Date.now() > 5_000;
            }
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      } finally {
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, [applySession, clearSession]);

  // Same pattern as `@carrental/client/react`'s web `AuthProvider` (`doRefreshRef.current =
  // doRefresh` at the identical spot) — `scheduleRefresh`'s `setTimeout` needs to call whatever
  // the *latest* `doRefresh` closure is without re-scheduling the timer on every render.
  // eslint-disable-next-line react-hooks/refs
  doRefreshRef.current = doRefresh;

  useEffect(() => {
    registerRefreshHandler(doRefresh);
    AsyncStorage.getItem(SESSION_HINT_KEY).then((hint) => {
      if (hint === '1') {
        void doRefresh().then((ok) => {
          if (!ok) setStatus('anonymous');
        });
      } else {
        setStatus('anonymous');
      }
    });
    return () => registerRefreshHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount, like the web provider
  }, []);

  // Foreground-resume check: the scheduled setTimeout above is best-effort while the JS runtime
  // is actually running. A phone backgrounded for 20 minutes doesn't fire it — so on resume,
  // check the token's real expiry (tracked in the token store) and refresh proactively.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (status !== 'authenticated') {
        // a launch/refresh that hit an outage kept the hint: try to restore now
        void AsyncStorage.getItem(SESSION_HINT_KEY).then((hint) => {
          if (hint === '1') void doRefreshRef.current();
        });
        return;
      }
      const expiresAt = getAccessTokenExpiresAt();
      if (expiresAt !== null && Date.now() > expiresAt - 60_000) {
        void doRefreshRef.current();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [status]);

  // FR-IAM-006: a signed-in actor's saved locale preference follows them, but only on the first
  // sync after it actually changes — never re-asserts the account default over a switcher choice
  // made this session (mirrors the web provider's fix for the S7 locale-revert bug).
  useEffect(() => {
    const next = actor?.localeCode;
    if (!next || next === appliedActorLocale.current) return;
    appliedActorLocale.current = next;
    void AsyncStorage.setItem(APPLIED_ACTOR_LOCALE_KEY, next);
    if (next !== locale) setLocale(next);
  }, [actor, locale, setLocale]);

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
      await clearAuthCookies();
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
