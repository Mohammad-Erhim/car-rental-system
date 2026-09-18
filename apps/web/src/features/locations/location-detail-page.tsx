import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  ArchiveRestore,
  ArrowLeft,
  CalendarOff,
  Clock,
  Contact,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ExceptionDialog } from './exception-dialog';
import { DAY_KEYS, mergeHours } from './location-model';
import { ArchiveDialog, LocationStatus, useRestoreLocation } from './location-parts';
import { LocationSheet } from './location-sheet';

import { DetailList } from '@/components/detail-list';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BreadcrumbLabelSetter } from '@/layouts/breadcrumb-label';
import { useOpsLocation, useOpsLocationImpact, useRemoveHoursException } from '@/lib/admin-hooks';
import { ApiError } from '@/lib/api';
import { useOpsCategories } from '@/lib/ops-discovery-hooks';

type Modal = 'edit' | 'archive' | 'exception';

const dash = <span className="text-muted-foreground">—</span>;

/**
 * One location: what discovery knows about it (hours, closures, categories, instructions). Edit,
 * archive and adding a closure open as modals from here. Times are in the location's own zone.
 */
export function LocationDetailPage() {
  const { t, fmt } = useI18n();
  const { code = '' } = useParams();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const location = useOpsLocation(code);
  const impact = useOpsLocationImpact(code);
  const categories = useOpsCategories();
  const removeException = useRemoveHoursException();
  const restore = useRestoreLocation();
  const [modal, setModal] = useState<Modal | null>(null);

  const l = location.data;
  const archived = l?.status === 'archived';
  const notFound = location.error instanceof ApiError && location.error.status === 404;
  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  if (location.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={notFound ? t('ops.loc.notFound') : t('ops.loc.loadFail')}
          actionLabel={notFound ? t('ops.loc.backToList') : t('ops.st.retry')}
          onAction={notFound ? () => history.back() : () => void location.refetch()}
        />
      </Page>
    );
  }
  if (!l) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }

  const week = mergeHours(l.regularHours);
  const today = new Date().getDay();
  const upcoming = (impact.data?.futureReservations ?? 0) + (impact.data?.openRentals ?? 0);
  const catName = (c: string) => categories.data?.find((x) => x.code === c)?.displayName ?? c;

  return (
    <Page data-testid="loc-record">
      <BreadcrumbLabelSetter label={l.name} />
      <div className="-mb-2">
        <Button variant="ghost" size="sm" className="-ms-2.5 text-muted-foreground" asChild>
          <Link to="/config/locations">
            <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
            {t('ops.loc.title')}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={l.name}
        badge={<LocationStatus status={l.status} />}
        description={
          <span className="bidi-isolate font-mono text-sm">
            {l.code} · {l.timezone}
          </span>
        }
        meta={impact.data ? <span>{t('ops.loc.futureImpact', { n: upcoming })}</span> : null}
        actions={
          canPublish ? (
            archived ? (
              <Button variant="outline" onClick={() => void restore(l)}>
                <ArchiveRestore aria-hidden="true" />
                {t('ops.loc.restore')}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setModal('archive')}
                  data-testid="loc-archive"
                >
                  <Trash2 aria-hidden="true" />
                  {t('ops.loc.archive')}
                </Button>
                <Button onClick={() => setModal('edit')} data-testid="loc-edit">
                  <Pencil aria-hidden="true" />
                  {t('ops.cat.edit')}
                </Button>
              </>
            )
          ) : null
        }
      />

      {archived ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.loc.archivedBanner')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={Clock} title={t('ops.loc.weeklyHours')}>
          <ul className="divide-y" data-testid="loc-hours">
            {week.map((s) => (
              <li
                key={s.day}
                className={`flex items-center justify-between gap-3 py-2.5 text-sm ${
                  s.day === today ? 'font-semibold' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  {t(`ops.loc.day.${DAY_KEYS[s.day]}`)}
                  {s.day === today ? <Badge variant="secondary">{t('ops.loc.today')}</Badge> : null}
                </span>
                <span className={s.closed ? 'text-muted-foreground' : 'tabular-nums'}>
                  {s.closed ? t('ops.loc.closed') : `${s.open} – ${s.close}`}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          icon={CalendarOff}
          title={t('ops.loc.exceptions')}
          description={t('ops.loc.exceptionsHint')}
          actions={
            canPublish && !archived ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModal('exception')}
                data-testid="loc-ex-new"
              >
                <Plus aria-hidden="true" />
                {t('ops.loc.addException')}
              </Button>
            ) : null
          }
        >
          {l.hoursExceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ops.loc.noExceptions')}</p>
          ) : (
            <ul className="divide-y" data-testid="loc-exceptions">
              {l.hoursExceptions.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{fmt.date(x.date)}</span>
                    <span className="block text-muted-foreground">
                      {x.closed ? t('ops.loc.closed') : `${x.open ?? ''} – ${x.close ?? ''}`}
                      {x.reason ? ` · ${x.reason}` : ''}
                    </span>
                  </span>
                  {canPublish && !archived ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('action.remove')}
                      onClick={async () => {
                        try {
                          await removeException.mutateAsync({ code: l.code, id: x.id });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : t('ops.loc.exSaveFail'));
                        }
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={Contact} title={t('ops.loc.secAddress')}>
          <DetailList
            className="sm:grid-cols-2 xl:grid-cols-2"
            items={[
              { term: t('ops.loc.addressLine1'), detail: l.address?.line1 || dash },
              { term: t('ops.loc.city'), detail: l.address?.city || dash },
              { term: t('ops.loc.region'), detail: l.address?.region || dash },
              { term: t('ops.loc.postalCode'), detail: l.address?.postalCode || dash },
              { term: t('ops.loc.country'), detail: l.address?.country || dash },
              {
                term: t('ops.loc.coordinates'),
                detail: l.latitude && l.longitude ? `${l.latitude}, ${l.longitude}` : dash,
              },
              { term: t('ops.loc.phone'), detail: l.contact?.phone || dash },
              { term: t('ops.loc.email'), detail: l.contact?.email || dash },
            ]}
          />
        </SectionCard>

        <SectionCard icon={FileText} title={t('ops.loc.secOperations')}>
          <DetailList
            className="sm:grid-cols-2 xl:grid-cols-2"
            items={[
              { term: t('ops.loc.turnaround'), detail: `${l.turnaroundMinutes} min` },
              {
                term: t('ops.loc.afterHours'),
                detail: t(l.afterHoursReturn ? 'ops.loc.yes' : 'ops.loc.no'),
              },
              {
                term: t('ops.loc.pickupInstructions'),
                detail: l.pickupInstructions || dash,
              },
              {
                term: t('ops.loc.returnInstructions'),
                detail: l.returnInstructions || dash,
              },
            ]}
          />
          <div className="mt-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('ops.loc.categories')}
            </p>
            {l.supportedCategoryCodes.length ? (
              <div className="flex flex-wrap gap-2" data-testid="loc-categories">
                {l.supportedCategoryCodes.map((c) => (
                  <Badge key={c} variant="outline">
                    {catName(c)}
                  </Badge>
                ))}
              </div>
            ) : (
              <Alert variant="warning">
                <AlertDescription>{t('ops.loc.categoriesNone')}</AlertDescription>
              </Alert>
            )}
          </div>
        </SectionCard>
      </div>

      {modal === 'edit' ? (
        <LocationSheet location={l} existingCodes={[]} open onOpenChange={close} />
      ) : null}
      {modal === 'archive' ? <ArchiveDialog location={l} open onOpenChange={close} /> : null}
      {modal === 'exception' ? <ExceptionDialog code={l.code} open onOpenChange={close} /> : null}
    </Page>
  );
}
