import { useI18n } from '@carrental/i18n/react';
import { CalendarDays, CarFront, FileText, IdCard, Mail, ShieldAlert, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useCanDecide } from './customer-dialogs';

import { paths } from '@/app/paths';
import { DetailList } from '@/components/detail-list';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CustomerRecord, CustomerRestriction, PrivacyRequest } from '@/lib/admin-hooks';

export type RestrictionAction = 'approve' | 'reject' | 'lift';
export type PrivacyRequestAction = 'review' | 'complete' | 'reject';

const bidi = (value: string | null | undefined) =>
  value ? <span className="bidi-isolate">{value}</span> : '—';

/** Contact details, language and consents. */
export function ProfileCard({ r }: { r: CustomerRecord }) {
  const { t } = useI18n();
  return (
    <SectionCard title={t('ops.cust.profile')} icon={Mail}>
      <DetailList
        items={[
          { term: t('ops.cust.email'), detail: bidi(r.email) },
          { term: t('ops.cust.phone'), detail: bidi(r.phone) },
          { term: t('ops.cust.locale'), detail: bidi(r.localeCode) },
          {
            term: t('ops.cust.consents'),
            detail: r.consents.length
              ? r.consents.map((c) => `${c.type} v${c.version}`).join(', ')
              : '—',
          },
        ]}
      />
    </SectionCard>
  );
}

/** What the customer owes (positive balance is money owed to us). */
export function BalanceCard({ r, money }: { r: CustomerRecord; money: (minor: number) => string }) {
  const { t } = useI18n();
  return (
    <SectionCard title={t('ops.cust.balance')} icon={Wallet}>
      <p
        className={
          r.balance.minor > 0
            ? 'text-3xl font-bold tabular-nums tracking-tight text-destructive'
            : 'text-3xl font-bold tabular-nums tracking-tight'
        }
      >
        {money(r.balance.minor)}
      </p>
    </SectionCard>
  );
}

export function ReservationsCard({
  r,
  money,
}: {
  r: CustomerRecord;
  money: (minor: number, currency: string) => string;
}) {
  const { t, fmt } = useI18n();
  return (
    <SectionCard
      title={`${t('ops.cust.reservations')} (${r.reservations.length})`}
      icon={CalendarDays}
    >
      {r.reservations.length === 0 ? (
        <StateView title={t('ops.cust.none')} className="py-4" />
      ) : (
        <ul className="divide-y">
          {r.reservations.slice(0, 10).map((x) => (
            <li
              key={x.reference}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-0.5">
                <Link
                  to={paths.reservation(x.reference)}
                  className="bidi-isolate font-mono text-sm font-semibold text-primary hover:underline"
                >
                  {x.reference}
                </Link>
                <p className="text-xs text-muted-foreground">{fmt.date(x.pickupAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  {money(x.totalMinor, x.currency)}
                </span>
                <StatusBadge status={x.state} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function DriversCard({ r }: { r: CustomerRecord }) {
  const { t } = useI18n();
  return (
    <SectionCard title={`${t('ops.cust.drivers')} (${r.drivers.length})`} icon={IdCard}>
      {r.drivers.length === 0 ? (
        <StateView title={t('ops.cust.none')} className="py-4" />
      ) : (
        <ul className="divide-y">
          {r.drivers.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="font-medium">{d.fullName}</span>
              <span className="bidi-isolate text-sm text-muted-foreground">
                {[d.licenceNumber, d.licenceCountry].filter(Boolean).join(' · ') || '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Rentals plus any open recovery cases tied to this customer. */
export function ActivityCard({ r }: { r: CustomerRecord }) {
  const { t } = useI18n();
  if (!r.rentals.length && !r.openCases.length) return null;
  return (
    <SectionCard title={t('ops.cust.activity')} icon={CarFront}>
      <ul className="divide-y">
        {r.rentals.map((x) => (
          <li
            key={x.reference}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <Link
              to={`/rentals/${encodeURIComponent(x.reference)}`}
              className="bidi-isolate font-mono text-sm font-semibold text-primary hover:underline"
            >
              {x.reference}
            </Link>
            <StatusBadge status={x.state} />
          </li>
        ))}
        {r.openCases.map((x) => (
          <li
            key={x.id}
            className="flex items-center justify-between gap-3 py-3 text-destructive first:pt-0 last:pb-0"
          >
            <span className="text-sm font-medium capitalize">{x.kind.replace(/_/g, ' ')}</span>
            <span className="bidi-isolate font-mono text-xs">{x.subjectRef}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RestrictionRow({
  x,
  onAction,
}: {
  x: CustomerRestriction;
  onAction: (x: CustomerRestriction, action: RestrictionAction) => void;
}) {
  const { t } = useI18n();
  const { manage, canApprove } = useCanDecide();
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      data-testid={`rstr-${x.id}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={x.category === 'block' ? 'destructive' : 'warning'}
            className="capitalize"
          >
            {x.category}
          </Badge>
          <Badge
            variant={
              x.status === 'active'
                ? 'destructive'
                : x.status === 'pending_review'
                  ? 'warning'
                  : 'secondary'
            }
          >
            {t(`ops.cust.rstrStatus.${x.status}`)}
          </Badge>
          <span className="bidi-isolate font-mono text-xs">{x.scope}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {x.reasonCode ? x.reasonCode.replace(/_/g, ' ') : t('ops.cust.noReason')}
          {x.reviewNotes ? ` · ${x.reviewNotes}` : ''}
        </p>
      </div>
      {manage && x.status === 'pending_review' ? (
        <div className="flex items-center gap-2">
          {canApprove ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction(x, 'approve')}
              data-testid={`rstr-approve-${x.id}`}
            >
              {t('ops.cust.rstrApprove')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAction(x, 'reject')}
            data-testid={`rstr-reject-${x.id}`}
          >
            {t('ops.cust.rstrReject')}
          </Button>
        </div>
      ) : null}
      {manage && x.status === 'active' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(x, 'lift')}
          data-testid={`rstr-lift-${x.id}`}
        >
          {t('ops.cust.rstrLift')}
        </Button>
      ) : null}
    </li>
  );
}

/** Eligibility restrictions: create → a manager approves → active → lift. */
export function RestrictionsCard({
  r,
  onAction,
}: {
  r: CustomerRecord;
  onAction: (x: CustomerRestriction, action: RestrictionAction) => void;
}) {
  const { t } = useI18n();
  const active = r.restrictions.some((x) => x.status === 'active');
  return (
    <SectionCard
      title={t('ops.cust.restrictions')}
      icon={ShieldAlert}
      className={active ? 'border-warning/60' : undefined}
      data-testid="cust-restrictions"
    >
      {r.restrictions.length === 0 ? (
        <StateView title={t('ops.cust.none')} className="py-4" />
      ) : (
        <ul className="divide-y">
          {r.restrictions.map((x) => (
            <RestrictionRow key={x.id} x={x} onAction={onAction} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const DREQ_STATUS_VARIANT: Record<
  PrivacyRequest['status'],
  'default' | 'secondary' | 'success' | 'warning' | 'destructive'
> = {
  received: 'default',
  in_review: 'default',
  blocked: 'warning',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
};

function PrivacyRequestRow({
  x,
  onAction,
}: {
  x: PrivacyRequest;
  onAction: (x: PrivacyRequest, action: PrivacyRequestAction) => void;
}) {
  const { t } = useI18n();
  const { manage } = useCanDecide();
  const canReview = manage && (x.status === 'received' || x.status === 'blocked');
  const canResolve = manage && ['received', 'in_review', 'blocked'].includes(x.status);
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      data-testid={`dreq-${x.id}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {t(`ops.cust.dreqKind.${x.kind}`)}
          </Badge>
          <Badge variant={DREQ_STATUS_VARIANT[x.status]}>
            {t(`ops.cust.dreqStatus.${x.status}`)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {x.detail ?? t('ops.cust.none')}
          {x.resolutionNote ? ` · ${x.resolutionNote}` : ''}
        </p>
        {x.blockers.length ? (
          <p className="text-xs text-warning">{x.blockers.map((b) => b.detail).join(' · ')}</p>
        ) : null}
      </div>
      {canReview || canResolve ? (
        <div className="flex items-center gap-2">
          {canReview ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction(x, 'review')}
              data-testid={`dreq-review-${x.id}`}
            >
              {t('ops.cust.dreqReview')}
            </Button>
          ) : null}
          {canResolve ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(x, 'complete')}
                data-testid={`dreq-complete-${x.id}`}
              >
                {t('ops.cust.dreqComplete')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAction(x, 'reject')}
                data-testid={`dreq-reject-${x.id}`}
              >
                {t('ops.cust.dreqReject')}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Access / correction / closure requests the customer filed (FR-IAM-008) — review, complete, reject. */
export function PrivacyRequestsCard({
  r,
  onAction,
}: {
  r: CustomerRecord;
  onAction: (x: PrivacyRequest, action: PrivacyRequestAction) => void;
}) {
  const { t } = useI18n();
  const pending = r.dataRequests.some((x) =>
    ['received', 'in_review', 'blocked'].includes(x.status),
  );
  return (
    <SectionCard
      title={t('ops.cust.dataRequests')}
      icon={FileText}
      className={pending ? 'border-warning/60' : undefined}
      data-testid="cust-data-requests"
    >
      {r.dataRequests.length === 0 ? (
        <StateView title={t('ops.cust.none')} className="py-4" />
      ) : (
        <ul className="divide-y">
          {r.dataRequests.map((x) => (
            <PrivacyRequestRow key={x.id} x={x} onAction={onAction} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Merge history for a survivor (and where a merged record went). */
export function MergeHistoryCard({ r }: { r: CustomerRecord }) {
  const { t } = useI18n();
  if (!r.mergeHistory.length && r.status !== 'merged') return null;
  return (
    <SectionCard title={t('ops.cust.mergeHistory')} icon={ShieldAlert} data-testid="cust-merge">
      {r.status === 'merged' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{t('ops.cust.merged')}</Badge>
          <span className="bidi-isolate font-mono text-xs">{r.mergedIntoId}</span>
        </div>
      ) : null}
      <ul className="space-y-1.5 text-sm text-muted-foreground" data-testid="cust-merge-history">
        {r.mergeHistory.map((m) => (
          <li key={m.id}>
            {t('ops.cust.mergeAbsorbed', {
              id: m.mergedId.slice(0, 8),
              drivers: m.movedDrivers,
              restrictions: m.movedRestrictions,
            })}
            {m.reversedAt ? ` · ${t('ops.cust.mergeReversed')}` : ''}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
