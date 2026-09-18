import { useI18n } from '@carrental/i18n/react';
import { History } from 'lucide-react';

import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Skeleton } from '@/components/ui/skeleton';

export interface HistoryEvent {
  type: string;
  at: string;
  note: string | null;
  actor: string;
  amountDeltaMinor: number;
}

const humanise = (code: string) => code.replace(/_/g, ' ');

/** Newest-last audit trail of what happened to the booking. */
export function HistoryCard({
  events,
  loading,
  money,
  testId = 'ops-resv-history',
}: {
  events: HistoryEvent[] | undefined;
  loading: boolean;
  money: (minor: number) => string;
  testId?: string;
}) {
  const { t, fmt } = useI18n();
  return (
    <SectionCard title={t('ops.resv.history')} icon={History}>
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !events?.length ? (
        <StateView title={t('ops.resv.noHistory')} className="py-4" />
      ) : (
        <ol className="relative space-y-5 border-s ps-5" data-testid={testId}>
          {events.map((e, i) => (
            <li key={i} className="relative">
              <span
                className="absolute -start-[1.6875rem] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card"
                aria-hidden="true"
              />
              <p className="text-sm font-medium capitalize">{humanise(e.type)}</p>
              <p className="text-xs text-muted-foreground">
                {fmt.dateTime(e.at)} · {e.actor}
                {e.amountDeltaMinor ? (
                  <>
                    {' · '}
                    <span className="bidi-isolate">{money(e.amountDeltaMinor)}</span>
                  </>
                ) : null}
              </p>
              {e.note ? <p className="mt-1 text-sm">{e.note}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
