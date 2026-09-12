import { useCallback } from 'react';
import { useSearchParams, type URLSearchParamsInit } from 'react-router-dom';

/**
 * The URL-backed-filter closure that `search-page.tsx`, `reservation-queue-page.tsx`,
 * `rental-board-page.tsx`, and `fleet-inventory-page.tsx` each reimplemented identically: set a
 * query param when truthy, delete it when empty, replacing history rather than pushing (a filter
 * change isn't a new "page" to go Back through). `params`/`setParams` are still returned
 * directly for the occasional compound update a page needs beyond one key (e.g. clearing several
 * params together when a view toggle changes).
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) =>
      setParams(
        (p) => {
          if (value) p.set(key, value);
          else p.delete(key);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const setParamsReplacing = useCallback(
    (next: URLSearchParamsInit | ((p: URLSearchParams) => URLSearchParamsInit)) =>
      setParams(next, { replace: true }),
    [setParams],
  );

  return { params, setParams: setParamsReplacing, setParam };
}
