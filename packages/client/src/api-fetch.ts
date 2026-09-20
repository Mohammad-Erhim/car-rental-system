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
  /** set on the one retry made after the person confirmed their password */
  _steppedUp?: boolean;
  /** skip attaching the bearer token (auth endpoints) */
  anonymous?: boolean;
}

let refreshing: Promise<boolean> | null = null;
let steppingUp: Promise<boolean> | null = null;

// Must match `csrfCookieName` in apps/api/src/common/security/refresh-cookie-name.ts — duplicated
// rather than imported since a package may not depend on an app. Deliberately non-HttpOnly on the
// server side so this can read it; echoing it back as a header is the double-submit half of
// CsrfGuard's defense for the cookie-authenticated auth endpoints (refresh / sign-out). One cookie
// per audience, so the ops dashboard and the site (same origin) keep separate sessions.
const csrfCookieName = (audience: 'staff' | 'customer') => `carrental_csrf_${audience}`;

function readCsrfCookie(audience: 'staff' | 'customer'): string | null {
  if (typeof document === 'undefined') return null; // SSR — no cookie jar to read
  const match = document.cookie.match(new RegExp(`(?:^|; )${csrfCookieName(audience)}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

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
  const { baseUrl, audience } = getClientConfig();
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
  // only relevant to cookie-authenticated writes (CsrfGuard only ever fires when the refresh
  // cookie is present), but harmless to attach on every mutation — cheaper than special-casing
  // which specific endpoints the guard happens to be decorated onto.
  if (opts.method && opts.method !== 'GET') {
    const csrf = readCsrfCookie(audience);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  // tells the API which cookie pair (staff / customer) this call is about — see `ClientConfig`
  if (path.startsWith('/auth/')) headers['X-Auth-Audience'] = audience;

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
  // A step-up demand is a 401 too, but the session is fine — the person only has to re-enter their
  // password. Refreshing the token cannot help, and the refreshed retry would burn the "retried"
  // flag so the password prompt below never appeared (the request just failed with "confirm your
  // password" and no dialog).
  const needsStepUp = isProblem(json) && json.code === 'auth_step_up_required';
  if (
    res.status === 401 &&
    !needsStepUp &&
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

  // a step-up-protected action: prompt for the password once, then retry. Deduped the same way
  // as the refresh above — a burst of concurrent requests all hitting `auth_step_up_required`
  // at once must share one prompt, not each open their own.
  const stepUpFn = getStepUpHandler();
  if (needsStepUp && !opts._steppedUp && stepUpFn && !path.startsWith('/auth/')) {
    steppingUp ??= stepUpFn().finally(() => {
      steppingUp = null;
    });
    const ok = await steppingUp;
    if (ok) return apiFetch<T>(path, { ...opts, _steppedUp: true });
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
