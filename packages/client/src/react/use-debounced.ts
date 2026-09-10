import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (e.g. a search box) so downstream effects — a query key, a
 * URL write — see one settled value per pause instead of one per keystroke.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
