import { useI18n } from '@carrental/i18n/react';
import { CheckCircle2, ChevronRight, Lock, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface FinanceExceptions {
  total: number;
  recoveryCases: number;
  reconciliation: number;
}

/** Open finance work — recovery cases and reconciliation breaks. */
export function FinanceExceptionsCard({
  data,
  loading,
  unavailable,
  orgWideNote,
}: {
  /** `null` = the account is limited to specific locations and these figures are org-wide */
  data: FinanceExceptions | null | undefined;
  loading: boolean;
  unavailable: boolean;
  /** true when a location filter is active but finance can only be counted org-wide */
  orgWideNote: boolean;
}) {
  const { t } = useI18n();

  return (
    <SectionCard
      title={t('ops.dash.financeExceptions')}
      icon={Wallet}
      actions={
        <Link
          to="/finance"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          {t('ops.dash.view')}
          <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-5 w-32" />
        </div>
      ) : data === null ? (
        <StateView
          icon={Lock}
          title={t('ops.dash.financeRestricted')}
          description={t('ops.dash.financeRestrictedBody')}
          className="py-6"
        />
      ) : unavailable || !data ? (
        <StateView kind="error" title={t('ops.dash.unavailable')} className="py-6" />
      ) : data.total === 0 ? (
        <div className="flex h-full flex-col justify-center gap-2 py-2">
          <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <p className="font-medium text-success">{t('ops.dash.zero.finance')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-4xl font-bold tabular-nums tracking-tight">{data.total}</p>
          <Badge variant="warning">
            {data.recoveryCases} + {data.reconciliation}
          </Badge>
        </div>
      )}
      {orgWideNote ? (
        <p className="mt-4 text-xs text-muted-foreground">{t('ops.dash.financeOrgWide')}</p>
      ) : null}
    </SectionCard>
  );
}
