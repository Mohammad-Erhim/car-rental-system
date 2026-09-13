'use client';

/**
 * A stable per-browser id for anonymous checkout actions (currently: the `holderKey` on a
 * discovery quote's inventory hold — see `checkAndHold` in the API). Generated once and reused
 * across retries/re-visits so a network-hiccup retry or a back-navigation resubmit is
 * recognisable server-side as "the same shopper reconsidering," not a new hold every time.
 * Deliberately separate from the `carrental_cid` consent cookie: that one only exists once a
 * visitor has made (or the app has recorded) a consent choice, and a reservation attempt must
 * not be gated on that.
 */
const KEY = 'carrental.guestId';

export function guestId(): string {
  if (typeof window === 'undefined') return `site-${Date.now()}`; // SSR fallback, never persisted
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return `site-${Date.now()}`; // private mode / disabled storage — falls back, not persisted
  }
}
