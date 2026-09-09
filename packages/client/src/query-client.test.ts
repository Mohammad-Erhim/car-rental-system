import { describe, expect, it } from 'vitest';

import { ApiError } from './api-error';
import { createQueryClient } from './query-client';

const problem = (code: string) => ({
  code,
  category: 'x',
  status: 503,
  title: code,
  correlationId: 't',
});

function retryFn() {
  const client = createQueryClient();
  return client.getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
}

describe('createQueryClient retry policy', () => {
  it('retries transient ApiErrors up to twice', () => {
    const retry = retryFn();
    expect(retry(0, new ApiError(problem('rate_limited')))).toBe(true);
    expect(retry(1, new ApiError(problem('dependency_unavailable')))).toBe(true);
    expect(retry(2, new ApiError(problem('provider_timeout')))).toBe(false);
  });

  it('never retries a non-transient ApiError (e.g. a 4xx)', () => {
    const retry = retryFn();
    expect(retry(0, new ApiError(problem('validation_failed')))).toBe(false);
    expect(retry(0, new ApiError(problem('not_found')))).toBe(false);
  });

  it('retries a plain network error up to twice', () => {
    const retry = retryFn();
    expect(retry(1, new Error('network'))).toBe(true);
    expect(retry(2, new Error('network'))).toBe(false);
  });

  it('does not retry mutations', () => {
    expect(createQueryClient().getDefaultOptions().mutations!.retry).toBe(false);
  });
});
