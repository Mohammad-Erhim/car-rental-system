import { useDebounced } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { useAuditActorSearch, type AuditActor } from '@/lib/admin-hooks';

/**
 * "Find an actor": the trail records only a raw id, so this looks accounts up by the name or email
 * someone actually knows. Picking one applies the filter straight away.
 */
export function ActorSearch({ onSelect }: { onSelect: (actor: AuditActor) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 300);
  const results = useAuditActorSearch(debounced);
  const showList = open && debounced.trim().length >= 2;

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className="ps-9"
        value={q}
        autoComplete="off"
        placeholder={t('ops.audit.filterByActorName')}
        aria-label={t('ops.audit.filterByActorName')}
        data-testid="audit-actor-search"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {showList ? (
        <div className="absolute z-20 mt-1 w-full min-w-[16rem] overflow-hidden rounded-lg border bg-popover shadow-md">
          {results.isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">{t('ops.st.loading')}</p>
          ) : !results.data?.length ? (
            <p className="p-3 text-xs text-muted-foreground">{t('ops.audit.noActorMatch')}</p>
          ) : (
            <ul>
              {results.data.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-start text-sm hover:bg-muted"
                    // keep focus on the input through the click so blur doesn't close the list first
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(a);
                      setQ('');
                      setOpen(false);
                    }}
                  >
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
