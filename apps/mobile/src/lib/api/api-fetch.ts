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

  const accessToken = getAccessToken();
  if (!opts.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

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
    code: res.status === 0 ? 'dependency_unavailable' : 'internal_error',
    category: 'internal',
    status: res.status || 503,
    title: res.statusText || 'Request failed',
    correlationId,
  });
}
