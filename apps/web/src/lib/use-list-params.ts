import { useCallback, useMemo } from 'react';

import { useUrlParams } from '@/lib/use-url-param';

export const PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;

const positiveInt = (v: string | null, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
};

export type ListParams<K extends string> = Record<K, string> & { page: number; pageSize: number };
export type ListPatch<K extends string> = Partial<Record<K, string>> & {
  page?: number;
  pageSize?: number;
};

/**
 * URL-backed state for a server-paginated list: a fixed set of string filters plus `page` and
 * `pageSize`. Keeping it all in the URL makes a view shareable and lets Back / refresh work.
 *
 * Any change other than paging itself returns the user to page 1 (the old page number means
 * nothing for a different result set), and default / empty values are dropped so URLs stay short.
 */
export function useListParams<K extends string>(filterKeys: readonly K[]) {
  const { params, setParams } = useUrlParams();
  const keysId = filterKeys.join(',');

  const state = useMemo(() => {
    const size = positiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE);
    const filters = Object.fromEntries(filterKeys.map((k) => [k, params.get(k) ?? ''])) as Record<
      K,
      string
    >;
    return {
      ...filters,
      page: positiveInt(params.get('page'), 1),
      pageSize: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
    } as ListParams<K>;
    // `filterKeys` is a constant per call site; its joined form is the stable identity
  }, [params, keysId]);

  const update = useCallback(
    (patch: ListPatch<K>) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          const isDefault =
            !value ||
            (key === 'page' && value === 1) ||
            (key === 'pageSize' && value === DEFAULT_PAGE_SIZE);
          if (isDefault) next.delete(key);
          else next.set(key, String(value));
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      }),
    [setParams],
  );

  const reset = useCallback(() => setParams({}), [setParams]);

  return { state, update, reset };
}
