import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api.js';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Retry only genuinely transient failures (SRS-API-004).
          if (error instanceof ApiError) {
            return (
              ['rate_limited', 'dependency_unavailable', 'provider_timeout'].includes(error.code) &&
              failureCount < 2
            );
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
