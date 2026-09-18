import { useMemo } from 'react';

import { useListParams, type ListPatch, type ListParams } from '@/lib/use-list-params';

export { PAGE_SIZES, DEFAULT_PAGE_SIZE } from '@/lib/use-list-params';

export type SearchKind = '' | 'reservation' | 'rental';

const KEYS = ['q', 'kind', 'status', 'location', 'from', 'to'] as const;
type Key = (typeof KEYS)[number];

/** Everything the search screen shows is derived from this — and it all lives in the URL. */
export type SearchState = Omit<ListParams<Key>, 'kind'> & { kind: SearchKind };

export function useSearchState() {
  const { state: raw, update, reset } = useListParams(KEYS);
  // a hand-edited URL must not smuggle in an unknown kind
  const state = useMemo<SearchState>(
    () => ({
      ...raw,
      kind: raw.kind === 'reservation' || raw.kind === 'rental' ? raw.kind : '',
    }),
    [raw],
  );
  return { state, update: update as (patch: ListPatch<Key>) => void, reset };
}

/** How many of the secondary filters (the ones behind the Filters sheet) are set. */
export function activeFilterCount(s: Pick<SearchState, 'status' | 'location' | 'from' | 'to'>) {
  return [s.status, s.location, s.from, s.to].filter(Boolean).length;
}
