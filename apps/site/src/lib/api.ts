/**
 * Server-side API client for `apps/site`. Talks to the NestJS API at `/api/v1`. In the browser
 * the same paths are proxied by `next.config` rewrites (same-origin, DEC-021); on the server we
 * call the upstream directly.
 *
 * Deliberately separate from `@carrental/client`'s `apiFetch`: that module keeps browser-only,
 * per-process singleton state (the bearer token store, a module-level in-flight refresh lock)
 * that is only safe for one signed-in browser tab — reusing it here, in a Node server process
 * handling concurrent requests for many different visitors, would leak one request's state into
 * another's. Every call here is anonymous SSR/ISR data fetching, so none of that machinery
 * applies. It still throws `@carrental/client`'s shared `ApiError` (never its own) — one error
 * type across the codebase, per CLAUDE.md.
 */
import { ApiError } from '@carrental/client';
import { isProblem } from '@carrental/contracts';

const UPSTREAM = process.env.API_UPSTREAM ?? 'http://localhost:3001';
const BASE = `${UPSTREAM}/api/v1`;

export interface GetOpts {
  /** ISR revalidate window in seconds (default 60). Pass 0 to opt out of the data cache. */
  revalidate?: number;
  headers?: Record<string, string>;
}

async function toApiError(res: Response, method: string, path: string): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  const json = text ? safeJson(text) : null;
  if (isProblem(json)) return new ApiError(json);
  return new ApiError({
    code: 'internal_error',
    category: 'internal',
    status: res.status || 503,
    title: res.statusText || `${method} ${path} → ${res.status}`,
    correlationId: res.headers.get('x-request-id') ?? 'unknown',
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiGet<T>(path: string, opts: GetOpts = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json', ...opts.headers },
    next: { revalidate: opts.revalidate ?? 60 },
  });
  if (!res.ok) throw await toApiError(res, 'GET', path);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  opts: { headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw await toApiError(res, 'POST', path);
  return res.json() as Promise<T>;
}

export { ApiError, UPSTREAM, BASE };
