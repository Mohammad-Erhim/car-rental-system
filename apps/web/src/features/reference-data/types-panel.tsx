import type { LookupType } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { ChevronRight, Lock, Search, SearchX } from 'lucide-react';

import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The catalogue of reference types: a searchable list. `types` is `undefined` while loading.
 */
export function TypesPanel({
  types,
  loading,
  error,
  onRetry,
  selected,
  onSelect,
  search,
  onSearch,
}: {
  types: LookupType[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selected: string;
  onSelect: (code: string) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)]">
      <div className="space-y-3 border-b p-4">
        <p className="text-sm font-semibold">{t('ops.ref.catalogue')}</p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('action.search')}
            aria-label={t('ops.ref.search')}
            className="ps-9 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <StateView
            kind="error"
            title={t('ops.st.loadFail', { what: t('ops.ref.title') })}
            actionLabel={t('ops.st.retry')}
            onAction={onRetry}
            className="py-8"
          />
        ) : !types?.length ? (
          <StateView icon={SearchX} title={t('ops.ref.noTypes')} className="py-8" />
        ) : (
          <ul className="space-y-0.5" data-testid="lookup-type-list">
            {types.map((tp) => {
              const active = tp.code === selected;
              return (
                <li key={tp.code}>
                  <button
                    type="button"
                    onClick={() => onSelect(tp.code)}
                    aria-current={active ? 'true' : undefined}
                    data-testid={`lookup-type-${tp.code}`}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="bidi-isolate block truncate font-mono text-sm font-medium">
                        {tp.code}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tp.classification.replace(/_/g, ' ')} ·{' '}
                        {t('ops.ref.activeCount', { n: tp.activeValueCount })}
                      </span>
                    </span>
                    {tp.editability === 'read_only' ? (
                      <Lock
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label={t('ops.ref.readOnly')}
                      />
                    ) : (
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {types?.length ? (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="me-1.5">
            {types.length}
          </Badge>
          {t('ops.ref.title')}
        </div>
      ) : null}
    </Card>
  );
}
