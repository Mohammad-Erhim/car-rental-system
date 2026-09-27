import CookieManager from '@react-native-cookies/cookies';

import { getApiOrigin } from './config';

// MUST match `csrfCookieName('customer')` in apps/api/src/common/security/refresh-cookie-name.ts — duplicated rather than
// imported since a package may not depend on an app (same constraint `@carrental/client`'s
// browser `readCsrfCookie` documents). Deliberately non-HttpOnly server-side so it's readable —
// here via the native cookie jar (`document.cookie` doesn't exist in RN) instead of `document`.
const CSRF_COOKIE = 'carrental_csrf_customer';

/**
 * The double-submit CSRF token for cookie-authenticated writes (`/auth/refresh`,
 * `/auth/sign-out`) — see `CsrfGuard` on the API. React Native's global `fetch` automatically
 * stores and resends cookies via the platform's native HTTP stack (including HttpOnly ones —
 * that flag only blocks *JS* access, not the native networking layer), the same way a browser
 * does; `@react-native-cookies/cookies` is only needed here to *read* the one cookie that isn't
 * HttpOnly, to echo it back as `X-CSRF-Token`.
 */
export async function readCsrfCookie(): Promise<string | null> {
  try {
    const cookies = await CookieManager.get(getApiOrigin());
    return cookies[CSRF_COOKIE]?.value ?? null;
  } catch {
    // No native cookie module available (e.g. Expo Go without a config plugin rebuild) —
    // mutations will fail CSRF-guarded endpoints; everything else still works.
    return null;
  }
}

/** Sign-out / "forget this device": drop every cookie the API set (refresh + CSRF). */
export async function clearAuthCookies(): Promise<void> {
  try {
    await CookieManager.clearAll();
  } catch {
    /* ignore */
  }
}

/** Android-only: forces the native cookie jar to disk before a deliberate process restart (see
 *  `LanguageRestartModal`), so the httpOnly refresh cookie a silent post-restart `/auth/refresh`
 *  depends on can't be lost to a write that was still in flight when the process exits. iOS's
 *  `WKHTTPCookieStore` has no equivalent flush call and needs none — it persists synchronously. */
export async function flushAuthCookies(): Promise<void> {
  try {
    await CookieManager.flush?.();
  } catch {
    /* ignore */
  }
}
