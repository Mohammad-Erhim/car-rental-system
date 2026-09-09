import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-error';

/** Error codes worth a retry — genuinely transient upstream conditions (SRS-API-004). */
const TRANSIENT = ['rate_limited', 'dependency_unavailable', 'provider_timeout'];

export interface QueryClientOptions {
  /** Default `staleTime` in ms (default 30_000). */
  staleTime?: number;
  /** Default `gcTime` in ms (default 300_000). */
  gcTime?: number;
}

/**
 * The shared TanStack Query client. One retry policy for every surface: retry a query at most
 * twice, and only when the failure is a transient `ApiError` (or a non-API network error) —
 * never on a 4xx the server will just reject again. Mutations never auto-retry.
 */
export function createQueryClient(opts: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: opts.staleTime ?? 30_000,
        gcTime: opts.gcTime ?? 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            return TRANSIENT.includes(error.code) && failureCount < 2;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
