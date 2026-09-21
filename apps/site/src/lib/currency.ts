/**
 * The visitor's chosen currency (DEC-036) — a cookie, like the language choice, so the server-
 * rendered search page can read it as well as the client-side booking flow. It is a preference,
 * not a promise: the API prices in it when it can and falls back to the business default when it
 * cannot, so a stale value (a currency since disabled) is harmless.
 */
import { useSyncExternalStore } from 'react';

import { CURRENCY_COOKIE, CURRENCY_COOKIE_MAX_AGE, parseCurrencyCookie } from './currency-cookie';

const CHANGE_EVENT = 'carrental:currency';

export function persistCurrencyChoice(code: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${CURRENCY_COOKIE}=${code};path=/;max-age=${CURRENCY_COOKIE_MAX_AGE};samesite=lax`;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** The chosen currency on the client, `undefined` before a choice is made (and on the server, so
 *  the first render matches what was sent). Re-renders when the switcher changes it. */
export function usePreferredCurrency(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => parseCurrencyCookie(document.cookie),
    () => undefined,
  );
}
