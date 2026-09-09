import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-error';
import { apiFetch } from './api-fetch';
import { configureClient } from './config';
import { registerRefreshHandler, setAccessToken } from './token-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const problem = (over: Partial<Record<string, unknown>> = {}) => ({
  code: 'validation_failed',
  category: 'validation',
  status: 422,
  title: 'Invalid',
  correlationId: 'test',
  ...over,
});

describe('apiFetch', () => {
  beforeEach(() => {
    configureClient({ baseUrl: '/api/v1', correlationPrefix: 'test' });
    setAccessToken(null);
    registerRefreshHandler(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefixes the configured base and returns the parsed body', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, { ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/meta/build')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meta/build', expect.any(Object));
  });

  it('attaches the bearer token unless the call is anonymous', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('tok-123');

    const authHeader = (i: number): string | undefined => {
      const call = fetchMock.mock.calls[i] as unknown as [string, RequestInit] | undefined;
      return (call?.[1]?.headers as Record<string, string> | undefined)?.Authorization;
    };

    await apiFetch('/trips');
    expect(authHeader(0)).toBe('Bearer tok-123');

    await apiFetch('/auth/sign-in', { method: 'POST', body: {}, anonymous: true });
    expect(authHeader(1)).toBeUndefined();
  });

  it('throws an ApiError carrying the Problem body on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(422, problem()))),
    );
    await expect(apiFetch('/trips')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'validation_failed',
      status: 422,
    });
  });

  it('does one silent refresh on 401, then retries the original call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, problem({ code: 'auth_session_expired', status: 401 })),
      )
      .mockResolvedValueOnce(jsonResponse(200, { trips: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue(true);
    registerRefreshHandler(refresh);

    await expect(apiFetch('/trips')).resolves.toEqual({ trips: [] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt a refresh for calls under /auth/', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(401, problem({ status: 401 })))),
    );
    const refresh = vi.fn().mockResolvedValue(true);
    registerRefreshHandler(refresh);

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
