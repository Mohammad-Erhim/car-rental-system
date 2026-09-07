/**
 * Server-side API client for `apps/site`. Talks to the NestJS API at `/api/v1`. In the browser
 * the same paths are proxied by `next.config` rewrites (same-origin, DEC-021); on the server we
 * call the upstream directly.
 */
const UPSTREAM = process.env.API_UPSTREAM ?? 'http://localhost:3001';
const BASE = `${UPSTREAM}/api/v1`;

export interface GetOpts {
  /** ISR revalidate window in seconds (default 60). Pass 0 to opt out of the data cache. */
  revalidate?: number;
  headers?: Record<string, string>;
}

export async function apiGet<T>(path: string, opts: GetOpts = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json', ...opts.headers },
    next: { revalidate: opts.revalidate ?? 60 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, `GET ${path} → ${res.status}`, body);
  }
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
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, `POST ${path} → ${res.status}`, text);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export { UPSTREAM, BASE };
