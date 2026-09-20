import { useI18n } from '@carrental/i18n/react';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/card';

/**
 * One request as a card — used by the task inbox and by the lists of requests, so a request looks the
 * same wherever it appears: what it is (small), what it is about (heading), who asked and when, then
 * its status badges, then — only where the person can act — the buttons. On a phone the buttons are
 * a two-column grid of full-width targets; from `sm` up they sit in a row.
 */
export function RequestCard({
  kicker,
  title,
  byline,
  href,
  badges,
  note,
  children,
}: {
  kicker: string;
  title: string;
  byline: string;
  href: string;
  badges?: ReactNode;
  /** a line under the badges (e.g. who it is waiting for, or an error) */
  note?: ReactNode;
  /** the action buttons, if any */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">{kicker}</p>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{byline}</p>
        </div>
        <Link
          to={href}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('ops.wf.open')}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
      {badges ? <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div> : null}
      {note ? <div className="mt-2 text-sm text-muted-foreground">{note}</div> : null}
      {children ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{children}</div>
      ) : null}
    </Card>
  );
}
