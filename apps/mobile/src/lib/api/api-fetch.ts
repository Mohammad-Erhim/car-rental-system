import { ApiError } from '@carrental/client';
import { isProblem } from '@carrental/contracts';

import { getApiBaseUrl } from './config';
import { readCsrfCookie } from './cookies';
import { getAccessToken, getRefreshHandler, getStepUpHandler } from './token-store';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string | number;
  signal?: AbortSignal;
  locale?: string;
  headers?: Record<string, string>;
  /** internal: prevents infinite refresh / step-up recursion */
  _retried?: boolean;
  /** skip attaching the bearer token (auth endpoints) */
  anonymous?: boolean;
}

let refreshing: Promise<boolean> | null = null;
let steppingUp: Promise<boolean> | null = null;

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The RN counterpart of `@carrental/client`'s `apiFetch` — same contract, same retry/refresh/
 * step-up semantics, same `ApiError`, deliberately reimplemented (not imported) because the
 * browser version is hard-wired to `document.cookie` for CSRF and has no injection seam. Keep
 * this in lockstep with that file when the refresh/step-up protocol changes.
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const correlationId = newCorrelationId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': correlationId,
    ...(opts.locale ? { 'Accept-Language': opts.locale } : {}),
    ...opts.headers,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.ifMatch !== undefined) headers['If-Match'] = String(opts.ifMatch);
  if (opts.method && opts.method !== 'GET') {
    const csrf = await readCsrfCookie();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  // which cookie pair the API should use — the app is customer-only (see `@carrental/client`)
  if (path.startsWith('/auth/')) headers['X-Auth-Audience'] = 'customer';

  const accessToken = getAccessToken();
  if (!opts.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    // `fetch` itself threw — DNS failure, no connectivity, or a TLS handshake the device's
    // networking stack rejects (seen on Android 7/API 24 devices) — before there's ever a
    // `Response` to inspect. Left uncaught, this was a raw `TypeError` no caller could tell apart
    // from a real bug, so every screen's `isError` branch rendered the same generic "that didn't
    // work" state a live server error would. Reshaping it into a distinct `ApiError` code lets
    // callers show an actual offline/unreachable state instead.
    // A cancelled request (query unmounted, refetch superseded) surfaces the same way — checked
    // by `name` alone, not `instanceof DOMException`, since Hermes doesn't define that global and
    // an `instanceof` against it throws a ReferenceError that would itself replace this error.
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') throw err;
    throw new ApiError({
      code: 'network_unavailable',
      category: 'dependency',
      status: 0,
      title: 'Network request failed',
      correlationId,
    });
  }

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (res.ok) return json as T;

  const refreshFn = getRefreshHandler();
  if (
    res.status === 401 &&
    !opts._retried &&
    !opts.anonymous &&
    refreshFn &&
    !path.startsWith('/auth/')
  ) {
    refreshing ??= refreshFn().finally(() => {
      refreshing = null;
    });
    const ok = await refreshing;
    if (ok) return apiFetch<T>(path, { ...opts, _retried: true });
  }

  const stepUpFn = getStepUpHandler();
  if (
    isProblem(json) &&
    json.code === 'auth_step_up_required' &&
    !opts._retried &&
    stepUpFn &&
    !path.startsWith('/auth/')
  ) {
    steppingUp ??= stepUpFn().finally(() => {
      steppingUp = null;
    });
    const ok = await steppingUp;
    if (ok) return apiFetch<T>(path, { ...opts, _retried: true });
  }

  if (isProblem(json)) throw new ApiError(json);
  throw new ApiError({
    code: 'internal_error',
    category: 'internal',
    status: res.status || 503,
    title: res.statusText || 'Request failed',
    correlationId,
  });
}
