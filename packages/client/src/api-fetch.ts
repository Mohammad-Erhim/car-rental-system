import { isProblem } from '@carrental/contracts';

import { ApiError } from './api-error';
import { getClientConfig } from './config';
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

function newCorrelationId(): string {
  const { correlationPrefix } = getClientConfig();
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${correlationPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The single browser entry point for the versioned API. Attaches the bearer token, an
 * idempotency key and `If-Match` when given, a correlation id, and `Accept-Language`; on a 401
 * it performs one silent refresh and retries; on `auth_step_up_required` it runs the registered
 * step-up prompt once and retries. Everything else surfaces as an `ApiError`.
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { baseUrl } = getClientConfig();
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

  const accessToken = getAccessToken();
  if (!opts.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (res.ok) return json as T;

  // silent refresh once on 401 for authenticated calls (never on /auth/* itself)
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

  // a step-up-protected action: prompt for the password once, then retry
  const stepUpFn = getStepUpHandler();
  if (
    isProblem(json) &&
    json.code === 'auth_step_up_required' &&
    !opts._retried &&
    stepUpFn &&
    !path.startsWith('/auth/')
  ) {
    const ok = await stepUpFn();
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
