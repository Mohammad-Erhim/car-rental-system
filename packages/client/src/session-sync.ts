/**
 * Small, framework-free helpers that keep silent refresh from ever signing a user out by
 * accident: cross-tab locking, transient-vs-definitive error classification, backoff.
 */
import { ApiError } from './api-error';

/**
 * Run `fn` while holding a browser-wide lock for this audience's refresh, so two tabs never
 * rotate the same refresh token at the same time. Falls back to running `fn` directly where the
 * Web Locks API is missing — the server's reuse grace window still absorbs that race.
 */
export async function withRefreshLock<T>(audience: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks?.request) return fn();
  return locks.request(`carrental.refresh.${audience}`, fn) as Promise<T>;
}

/**
 * Only the API saying "this session is over" (401) may end a session. A network failure, a
 * timeout, a 5xx / 429, an API restart or a proxy error is *not* a logout — retry, keep the hint.
 */
export function isSessionEnded(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** Exponential backoff with ±25% jitter so tabs/devices don't retry in lockstep. */
export function backoffMs(attempt: number, baseMs: number, capMs: number): number {
  const raw = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(raw * (0.75 + Math.random() * 0.5));
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
