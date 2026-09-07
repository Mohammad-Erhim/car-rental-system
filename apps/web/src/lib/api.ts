import {
  isProblem,
  type BuildInfo,
  type HealthSummary,
  type LocalesResponse,
  type Problem,
} from '@carrental/contracts';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

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
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** sent as Idempotency-Key for consequential commands (SRS-API-006) */
  idempotencyKey?: string;
  /** sent as If-Match for optimistic concurrency (SRS-API-007) */
  ifMatch?: string | number;
  signal?: AbortSignal;
  locale?: string;
  headers?: Record<string, string>;
}

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (!res.ok) {
    if (isProblem(json)) throw new ApiError(json);
    throw new ApiError({
      code: res.status === 0 ? 'dependency_unavailable' : 'internal_error',
      category: 'internal',
      status: res.status || 503,
      title: res.statusText || 'Request failed',
      correlationId,
    });
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Typed helpers for the meta endpoints used by STAGE-000 landings. */
export const metaApi = {
  locales: (signal?: AbortSignal) => apiFetch<LocalesResponse>('/meta/locales', { signal }),
  build: (signal?: AbortSignal) => apiFetch<BuildInfo>('/meta/build', { signal }),
  healthSummary: (signal?: AbortSignal) =>
    apiFetch<HealthSummary>('/meta/health-summary', { signal }),
};
