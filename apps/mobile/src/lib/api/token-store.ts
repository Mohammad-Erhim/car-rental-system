/**
 * Module-scoped holder for the in-memory access token plus the hooks the auth layer registers
 * (silent refresh, step-up re-auth) — the same shape as `@carrental/client`'s browser token
 * store (kept out of React so `apiFetch` can reach them without a hook), reimplemented here
 * because that package's copy is a private module-scope singleton with no injection point: our
 * own RN `apiFetch` needs its own store to register into. The access token is deliberately never
 * persisted to disk — only the httpOnly refresh cookie (held by the native cookie jar) survives
 * an app restart; see `auth-provider.tsx` for the silent-refresh-on-launch flow.
 */

let accessToken: string | null = null;
let accessTokenExpiresAt: number | null = null; // epoch ms
let refreshFn: (() => Promise<boolean>) | null = null;
let stepUpFn: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null, expiresInSeconds?: number): void {
  accessToken = token;
  accessTokenExpiresAt = token && expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Used on app-foreground to decide whether a background-suspended refresh timer needs a kick
 *  (RN throttles/suspends JS timers while backgrounded, unlike a browser tab). */
export function getAccessTokenExpiresAt(): number | null {
  return accessTokenExpiresAt;
}

export function registerRefreshHandler(fn: (() => Promise<boolean>) | null): void {
  refreshFn = fn;
}

export function getRefreshHandler(): (() => Promise<boolean>) | null {
  return refreshFn;
}

export function registerStepUpHandler(fn: (() => Promise<boolean>) | null): void {
  stepUpFn = fn;
}

export function getStepUpHandler(): (() => Promise<boolean>) | null {
  return stepUpFn;
}
