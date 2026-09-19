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
import { configureClient } from '../config';
import { backoffMs, isSessionEnded, sleep, withRefreshLock } from '../session-sync';
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
// restart or a second tab looks signed-out despite a valid cookie (S7-DEF-005). Scoped per
// audience: the ops dashboard and the site share an origin (and so localStorage), but must not
// share — or clear — each other's hint.
const sessionHintKey = (audience: Audience) => `carrental.session.hint.${audience}`;
const LEGACY_SESSION_HINT_KEY = 'carrental.session.hint';
// The actor `localeCode` we last pushed into the i18n context. Persisted so "the actor's saved
// locale changed" is judged across reloads, not just within one page life — otherwise every
// refresh re-applies the account default and silently overwrites a switcher choice the user
// made this session (S7 locale-revert).
const appliedActorLocaleKey = (audience: Audience) => `carrental.locale.fromActor.${audience}`;

function readAppliedActorLocale(audience: Audience): string | null {
  try {
    return localStorage.getItem(appliedActorLocaleKey(audience));
  } catch {
    return null;
  }
}

function writeAppliedActorLocale(audience: Audience, locale: string): void {
  try {
    localStorage.setItem(appliedActorLocaleKey(audience), locale);
  } catch {
    /* ignore */
  }
}

// Refresh resilience. A failed refresh only ends the session when the API says so (401). Anything
// else — network, 5xx, 429, a restart — is retried inline (short backoff), then in the background
// (long backoff, bounded) and on `online` / tab-visible, while the user stays signed in.
const INLINE_RETRY_DELAYS_MS = [400, 1200, 3000];
const BACKGROUND_RETRY_BASE_MS = 15_000;
const BACKGROUND_RETRY_CAP_MS = 120_000;
const BACKGROUND_RETRY_MAX = 8;
/** Refresh when the access token has less than this left (timer, tab-visible, back online). */
const REFRESH_LEEWAY_MS = 60_000;
/** A session installed this recently (by this or another tab) makes a queued refresh redundant. */
const FRESH_SESSION_MS = 5_000;

type RefreshResult = 'ok' | 'ended' | 'unavailable';

export interface AuthProviderProps {
  children: ReactNode;
  /**
   * The session this app owns, and the audience used when `signIn` is called without one.
   * `apps/site` → 'customer'; ops → 'staff'.
   */
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
 *
 * Session safety (never sign the user out by accident):
 *  - refresh is single-flight per tab AND serialised across tabs (Web Locks); the tab that wins
 *    shares the fresh session with the others over a BroadcastChannel, so they don't refresh;
 *  - the session ends only on a definitive 401 — transient failures retry with backoff;
 *  - refresh also runs when the tab becomes visible / the network returns, so a laptop that slept
 *    through the access token's expiry recovers without a failed request.
 */
export function AuthProvider({
  children,
  defaultAudience = 'customer',
  followActorLocale = true,
}: AuthProviderProps) {
  const audience = defaultAudience;
  // Must be in place before any child effect calls `apiFetch` (cookie pair + `X-Auth-Audience`).
  useState(() => configureClient({ audience }));

  const qc = useQueryClient();
  const { locale, setLocale } = useI18n();
  const [actor, setActor] = useState<Actor | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const statusRef = useRef(status);
  statusRef.current = status;
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRetries = useRef(0);
  const tokenExpiresAt = useRef(0);
  const installedAt = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const appliedActorLocale = useRef<string | null>(readAppliedActorLocale(audience));
  const doRefreshRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const delay = Math.max(5, expiresInSeconds - REFRESH_LEEWAY_MS / 1000) * 1000;
    refreshTimer.current = setTimeout(() => {
      void doRefreshRef.current();
    }, delay);
  }, []);

  const cancelRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    backgroundRetries.current = 0;
  }, []);

  /** Adopt a session locally (no cross-tab announcement). */
  const installSession = useCallback(
    (session: SessionResponse) => {
      setAccessToken(session.accessToken);
      setActor(session.actor);
      setStatus('authenticated');
      installedAt.current = Date.now();
      tokenExpiresAt.current = Date.now() + session.expiresInSeconds * 1000;
      cancelRetry();
      try {
        localStorage.setItem(sessionHintKey(audience), '1');
      } catch {
        /* ignore */
      }
      scheduleRefresh(session.expiresInSeconds);
    },
    [audience, cancelRetry, scheduleRefresh],
  );

  /** Adopt a freshly issued session AND tell the other tabs, so they don't each refresh. */
  const applySession = useCallback(
    (session: SessionResponse) => {
      installSession(session);
      try {
        channelRef.current?.postMessage({ type: 'session', session });
      } catch {
        /* ignore */
      }
    },
    [installSession],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setActor(null);
    setStatus('anonymous');
    tokenExpiresAt.current = 0;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    cancelRetry();
    try {
      localStorage.removeItem(sessionHintKey(audience));
    } catch {
      /* ignore */
    }
    qc.clear();
  }, [audience, cancelRetry, qc]);

  /** One refresh round-trip, retrying transient failures inline. Never throws. */
  const requestRefresh = useCallback(async (): Promise<RefreshResult> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const session = await apiFetch<SessionResponse>('/auth/refresh', {
          method: 'POST',
          anonymous: true,
        });
        applySession(session);
        return 'ok';
      } catch (err) {
        if (isSessionEnded(err)) return 'ended';
        const delay = INLINE_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) return 'unavailable';
        await sleep(backoffMs(0, delay, delay));
      }
    }
  }, [applySession]);

  const scheduleBackgroundRetry = useCallback(() => {
    if (retryTimer.current || backgroundRetries.current >= BACKGROUND_RETRY_MAX) return;
    const delay = backoffMs(
      backgroundRetries.current,
      BACKGROUND_RETRY_BASE_MS,
      BACKGROUND_RETRY_CAP_MS,
    );
    backgroundRetries.current += 1;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void doRefreshRef.current();
    }, delay);
  }, []);

  // Refresh tokens rotate: a second request racing the first (React StrictMode's double mount in
  // dev, or the cross-tab `storage` handler firing alongside the mount restore) must not present
  // an already-rotated token. Share the in-flight call within the tab; `withRefreshLock`
  // serialises it across tabs, and a queued tab skips its round-trip if another tab just
  // delivered a fresh session.
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const doRefresh = useCallback((): Promise<boolean> => {
    refreshInFlight.current ??= (async () => {
      try {
        const requestedAt = Date.now();
        const result = await withRefreshLock(audience, async (): Promise<RefreshResult> => {
          const now = Date.now();
          // Another tab (or an earlier call) delivered a session while we queued for the lock —
          // or just now — so this round-trip would only rotate a token that was just rotated.
          const delivered =
            installedAt.current > requestedAt ||
            (now - installedAt.current < FRESH_SESSION_MS && tokenExpiresAt.current - now > 30_000);
          if (delivered) {
            scheduleRefresh((tokenExpiresAt.current - now) / 1000); // keep the timer chain alive
            return 'ok';
          }
          return requestRefresh();
        });
        if (result === 'ended') {
          clearSession();
          return false;
        }
        if (result === 'unavailable') {
          // The API is unreachable / erroring — that is not a logout. Keep the hint, and retry in
          // the background. If we were still restoring, stop showing the loading state.
          if (statusRef.current === 'loading') setStatus('anonymous');
          scheduleBackgroundRetry();
          return tokenExpiresAt.current - Date.now() > 5_000; // the current token may still work
        }
        return true;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, [audience, clearSession, requestRefresh, scheduleBackgroundRetry, scheduleRefresh]);

  doRefreshRef.current = doRefresh;

  // on mount: restore a session only when a prior session hint exists (avoids an expected 401 on
  // every fresh visit). The refresh cookie is only set after a successful sign-in / verify.
  useEffect(() => {
    registerRefreshHandler(doRefresh);
    let hadHint = false;
    try {
      localStorage.removeItem(LEGACY_SESSION_HINT_KEY); // pre-audience shared hint — obsolete
      hadHint = localStorage.getItem(sessionHintKey(audience)) === '1';
    } catch {
      /* ignore */
    }
    if (hadHint) {
      void doRefresh().then((ok) => {
        if (!ok && statusRef.current === 'loading') setStatus('anonymous');
      });
    } else {
      setStatus('anonymous');
    }

    // S7-OPT-002 — cross-tab sync. A sign-out (hint removed) elsewhere clears this tab. A session
    // issued elsewhere arrives over the BroadcastChannel and is adopted without a round-trip; the
    // `storage` sign-in event is the fallback for browsers without BroadcastChannel.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== sessionHintKey(audience)) return;
      if (e.newValue === '1') {
        if (statusRef.current !== 'authenticated') void doRefresh();
      } else clearSession();
    };
    window.addEventListener('storage', onStorage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(`carrental.auth.${audience}`);
      channel.onmessage = (e: MessageEvent<{ type?: string; session?: SessionResponse }>) => {
        if (e.data?.type === 'session' && e.data.session) installSession(e.data.session);
      };
      channelRef.current = channel;
    }

    // A tab that slept, was backgrounded (throttled timers) or lost connectivity may hold an
    // expired / soon-expired access token, or be waiting on a background retry: settle it now,
    // proactively, instead of letting the next user action fail first.
    const settle = () => {
      if (document.visibilityState === 'hidden') return;
      let hint = false;
      try {
        hint = localStorage.getItem(sessionHintKey(audience)) === '1';
      } catch {
        /* ignore */
      }
      const authed = statusRef.current === 'authenticated';
      if (
        (authed && tokenExpiresAt.current - Date.now() < REFRESH_LEEWAY_MS) ||
        (!authed && hint)
      ) {
        backgroundRetries.current = 0;
        void doRefresh();
      }
    };
    document.addEventListener('visibilitychange', settle);
    window.addEventListener('online', settle);
    window.addEventListener('focus', settle);

    return () => {
      registerRefreshHandler(null);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', settle);
      window.removeEventListener('online', settle);
      window.removeEventListener('focus', settle);
      channel?.close();
      channelRef.current = null;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [audience, doRefresh, clearSession, installSession]);

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
      writeAppliedActorLocale(audience, next);
      if (followActorLocale && next !== locale) setLocale(next);
    }
  }, [actor, audience, locale, setLocale, followActorLocale]);

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
