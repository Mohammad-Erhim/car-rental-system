import Constants from 'expo-constants';

/**
 * `EXPO_PUBLIC_API_URL` (via `app.config.ts` -> `extra.apiUrl`) is the single source of truth
 * for the API origin — set per EAS build profile in `eas.json`, or via `.env` for local dev.
 */
export function getApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  const url = fromExtra ?? 'http://localhost:3001/api/v1';
  return url.replace(/\/$/, '');
}

/** Scheme + host only (no `/api/v1` path) — the scope `@react-native-cookies/cookies` needs to
 *  read every cookie set for this host, since the CSRF cookie is `Path=/` while the refresh
 *  cookie is scoped to `/api/v1/auth` (see apps/api `iam.cookies.ts`). */
export function getApiOrigin(): string {
  try {
    const u = new URL(getApiBaseUrl());
    return `${u.protocol}//${u.host}`;
  } catch {
    return getApiBaseUrl();
  }
}

export const CORRELATION_PREFIX = 'mobile';

/** Vehicle/category photos come back from the API as a signed but *relative* path
 *  (`/api/v1/assets/<key>?exp=...&sig=...` — see `object-storage.service.ts#signRef`), because on
 *  the web that resolves fine against the page's own origin. React Native's `Image` has no such
 *  origin to resolve against — a relative `uri` just fails to load, silently, with the image slot
 *  left blank instead of falling back to the app's own placeholder art. Absolutize it against the
 *  configured API origin before handing it to `<Image>`. */
export function resolveAssetUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${getApiOrigin()}${url}`;
}
