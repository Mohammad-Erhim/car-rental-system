'use client';

import {
  ALL_CONSENT_CHOICES,
  CONSENT_POLICY_VERSION,
  DEFAULT_CONSENT_CHOICES,
  type ConsentAction,
  type ConsentCategory,
  type ConsentChoices,
} from '@carrental/contracts';
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

const CONSENT_COOKIE = 'carrental_consent';
const CID_COOKIE = 'carrental_cid';
const ONE_YEAR = 60 * 60 * 24 * 365;
export const OPEN_PREFERENCES_EVENT = 'carrental:open-cookie-preferences';

interface StoredConsent {
  v: number;
  c: ConsentChoices;
  a: ConsentAction;
  t: string;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const hit = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))
    ).toString(16),
  );
}

function loadStored(): StoredConsent | null {
  const raw = readCookie(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredConsent;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== CONSENT_POLICY_VERSION) return null;
    return {
      v: parsed.v,
      a: parsed.a,
      t: parsed.t,
      c: { ...DEFAULT_CONSENT_CHOICES, ...parsed.c, necessary: true },
    };
  } catch {
    return null;
  }
}

interface ConsentContextValue {
  ready: boolean;
  /** true once the visitor has made an explicit choice under the current policy version */
  decided: boolean;
  choices: ConsentChoices;
  hasConsent: (category: ConsentCategory) => boolean;
  /** the banner/preferences surface is visible */
  bannerOpen: boolean;
  prefsOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (choices: ConsentChoices) => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({
  children,
  locale,
  enabled = true,
}: {
  children: ReactNode;
  locale: string;
  enabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [decided, setDecided] = useState(false);
  const [choices, setChoices] = useState<ConsentChoices>(DEFAULT_CONSENT_CHOICES);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const cidRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setChoices(stored.c);
      setDecided(true);
    }
    cidRef.current = readCookie(CID_COOKIE);
    setReady(true);
  }, []);

  const persist = useCallback(
    (next: ConsentChoices, action: ConsentAction) => {
      const payload: StoredConsent = {
        v: CONSENT_POLICY_VERSION,
        c: next,
        a: action,
        t: new Date().toISOString(),
      };
      writeCookie(CONSENT_COOKIE, JSON.stringify(payload), ONE_YEAR);
      if (!cidRef.current) {
        cidRef.current = uuid();
        writeCookie(CID_COOKIE, cidRef.current, ONE_YEAR);
      }
      setChoices(next);
      setDecided(true);
      setPrefsOpen(false);

      // fire-and-forget accountability record
      try {
        void fetch('/api/v1/consent', {
          method: 'POST',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            anonymousId: cidRef.current,
            action,
            choices: next,
            policyVersion: CONSENT_POLICY_VERSION,
            locale,
            page: window.location.pathname,
          }),
        });
      } catch {
        /* network offline — the cookie is still authoritative */
      }
    },
    [locale],
  );

  const value = useMemo<ConsentContextValue>(
    () => ({
      ready,
      decided,
      choices,
      hasConsent: (category) => (category === 'necessary' ? true : !!choices[category]),
      bannerOpen: enabled && ready && !decided && !prefsOpen,
      prefsOpen: enabled && prefsOpen,
      openPreferences: () => setPrefsOpen(true),
      closePreferences: () => setPrefsOpen(false),
      acceptAll: () => persist(ALL_CONSENT_CHOICES, 'accept_all'),
      rejectAll: () => persist(DEFAULT_CONSENT_CHOICES, 'reject_all'),
      savePreferences: (next) => persist({ ...next, necessary: true }, 'save_preferences'),
    }),
    [ready, decided, choices, enabled, prefsOpen, persist],
  );

  useEffect(() => {
    if (!enabled) return;
    const onOpen = () => setPrefsOpen(true);
    window.addEventListener(OPEN_PREFERENCES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, onOpen);
  }, [enabled]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    // outside the provider (e.g. isolated preview) — inert, everything denied
    return {
      ready: true,
      decided: true,
      choices: DEFAULT_CONSENT_CHOICES,
      hasConsent: (c) => c === 'necessary',
      bannerOpen: false,
      prefsOpen: false,
      openPreferences: () => {},
      closePreferences: () => {},
      acceptAll: () => {},
      rejectAll: () => {},
      savePreferences: () => {},
    };
  }
  return ctx;
}

/** Dispatch from anywhere (e.g. the footer link) to open the preference centre. */
export function openCookiePreferences() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}
