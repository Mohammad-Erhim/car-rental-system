import { apiFetch } from '@carrental/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * A location the signed-in staff account may pick from — in a list filter or a form. Comes from
 * `GET /ops/locations/options`, which (unlike the public `/config/locations`) returns archived
 * branches too, flagged, and is narrowed to the account's scope AS OF THIS REQUEST, so a scope
 * change made by an administrator takes effect without waiting for the next sign-in refresh.
 */
export interface LocationOption {
  id: string;
  code: string;
  name: string;
  /** `active` | `archived` (| `draft`) */
  status: string;
  timezone: string;
}

/** `restricted`: the account is limited to specific locations (as of this request). */
export interface LocationOptions {
  restricted: boolean;
  options: LocationOption[];
}

export const LOCATION_OPTIONS_KEY = ['ops', 'location-options'] as const;

export function useLocationOptions() {
  return useQuery({
    queryKey: LOCATION_OPTIONS_KEY,
    queryFn: ({ signal }) => apiFetch<LocationOptions>('/ops/locations/options', { signal }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Refresh every place a location list is cached — call after creating / renaming / archiving one. */
export function useInvalidateLocations() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: LOCATION_OPTIONS_KEY });
    void qc.invalidateQueries({ queryKey: ['config', 'locations'] });
    void qc.invalidateQueries({ queryKey: ['ops', 'locations'] });
  };
}
