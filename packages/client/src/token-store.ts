/**
 * Module-scoped holder for the in-memory access token plus the hooks the auth layer registers
 * (silent refresh, step-up re-auth). Kept out of React so `apiFetch` can reach them without a
 * hook. The access token is deliberately never persisted — only the refresh cookie is.
 */

let accessToken: string | null = null;
let refreshFn: (() => Promise<boolean>) | null = null;
let stepUpFn: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by the auth provider: rotate the session via `POST /auth/refresh`. */
export function registerRefreshHandler(fn: (() => Promise<boolean>) | null): void {
  refreshFn = fn;
}

export function getRefreshHandler(): (() => Promise<boolean>) | null {
  return refreshFn;
}

/** Registered by the step-up provider (ops only): prompt for the password, `POST /auth/step-up`. */
export function registerStepUpHandler(fn: (() => Promise<boolean>) | null): void {
  stepUpFn = fn;
}

export function getStepUpHandler(): (() => Promise<boolean>) | null {
  return stepUpFn;
}
