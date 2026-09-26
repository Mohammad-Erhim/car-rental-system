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

/** Vehicle/category photos come back from the API as a signed but *relative* path, always in the
 *  browser-facing form `/api/v1/assets/<key>?exp=...&sig=...` (see `object-storage.service.ts#
 *  signRef`) — correct when resolved against a browser-facing origin whose own reverse-proxy
 *  location keeps that `/api` prefix. React Native's `Image` has no page origin to resolve a
 *  relative `uri` against at all, so this absolutizes it against `getApiOrigin()` instead — but a
 *  dedicated mobile API domain (see `deploy/nginx.edge.conf`'s `${API_DOMAIN}` block) expects the
 *  `/api` prefix stripped (its proxy re-adds it), matching `EXPO_PUBLIC_API_URL` being configured
 *  as `.../v1` rather than `.../api/v1` for that domain. Rewrite the server's `/api/v1` prefix to
 *  whatever prefix `getApiBaseUrl()` itself uses, so both origin shapes resolve correctly. */
export function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const basePath = new URL(getApiBaseUrl()).pathname.replace(/\/$/, '');
  const path = url.replace(/^\/api\/v1(?=\/|$)/, basePath);
  return `${getApiOrigin()}${path}`;
}
