import { createQueryClient } from './api/query-client';

/** One `QueryClient` for the app's lifetime — created outside React so it survives Fast Refresh
 *  during development instead of resetting the cache on every edit. */
export const queryClient = createQueryClient();
