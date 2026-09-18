import { useDebounced } from '@carrental/client/react';
import { useEffect, useState } from 'react';

/**
 * A search box whose settled text is committed to the URL (or any store) after a pause, with the
 * store staying the source of truth: back/forward and "clear all" flow back into the box.
 *
 * @param stored  the committed value (e.g. the `q` URL param)
 * @param commit  called with the trimmed text once typing settles
 */
export function useSearchBox(stored: string, commit: (value: string) => void, delayMs = 350) {
  const [draft, setDraft] = useState(stored);
  const settled = useDebounced(draft.trim(), delayMs);

  // store → box
  useEffect(() => setDraft(stored), [stored]);
  // box → store, once typing settles
  useEffect(() => {
    if (settled !== stored) commit(settled);
    // only a newly settled value should commit; `stored`/`commit` changes must not re-fire it
  }, [settled]);

  return {
    draft,
    setDraft,
    /** empties the box and commits immediately (no debounce) */
    clear: () => {
      setDraft('');
      commit('');
    },
  };
}
