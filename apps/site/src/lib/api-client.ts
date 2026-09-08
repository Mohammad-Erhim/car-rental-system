/**
 * Browser API client for `apps/site` authed flows (sign-in, account, trips, checkout).
 *
 * Server components use `lib/api.ts` (`apiGet`/`apiPost`, direct upstream). This module is the
 * client-side counterpart: it runs in the browser, calls the same `/api/v1` paths (proxied
 * same-origin by `next.config` rewrites, DEC-021), carries the in-memory access token, and does
 * one silent refresh on a 401. Adapted from `apps/web/src/lib/api.ts`.
 */
'use client';

import { isProblem, type Problem } from '@carrental/contracts';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(problem.title || problem.code);
    this.name = 'ApiError';
    this.problem = problem;
  }
  get code() {
    return this.problem.code;
  }
  get status() {
    return this.problem.status;
  }
  get fieldErrors() {
    return this.problem.fieldErrors ?? [];
  }
}

let accessToken: string | null = null;
let refreshFn: (() => Promise<boolean>) | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}
export function registerRefreshHandler(fn: (() => Promise<boolean>) | null): void {
  refreshFn = fn;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string | number;
  signal?: AbortSignal;
  locale?: string;
  headers?: Record<string, string>;
  /** internal: prevents infinite refresh recursion */
  _retried?: boolean;
  /** skip attaching the bearer token (auth endpoints) */
  anonymous?: boolean;
}

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `site-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
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
  if (!opts.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (res.ok) return json as T;

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

  if (isProblem(json)) throw new ApiError(json);
  throw new ApiError({
    code: res.status === 0 ? 'dependency_unavailable' : 'internal_error',
    category: 'internal',
    status: res.status || 503,
    title: res.statusText || 'Request failed',
    correlationId,
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
