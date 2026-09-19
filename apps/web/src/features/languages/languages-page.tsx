import { useAuth } from '@carrental/client/react';
import { SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Languages,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Star,
  Trash2,
  Type,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { LanguageDialog } from './language-dialog';

import { paths } from '@/app/paths';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAdminLocales,
  useDeleteLocale,
  useLocaleAction,
  useTranslationCompleteness,
  type AdminLocale,
} from '@/lib/api-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = ['status'] as const;
const STATUSES = ['all', 'on', 'off'] as const;
type Status = (typeof STATUSES)[number];
const getRowId = (l: AdminLocale) => l.id;

type Modal =
  | { kind: 'dialog'; locale: AdminLocale | null }
  | { kind: 'deactivate' | 'default' | 'delete'; locale: AdminLocale };

/** Share of a language's strings that are published, or null when it has none yet. */
function Coverage({ pct }: { pct: number | null }) {
  const { t } = useI18n();
  if (pct == null)
    return <span className="text-xs text-warning">{t('ops.languages.noStrings')}</span>;
  return (
    <div className="flex min-w-[8rem] items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('ops.languages.coverage', { pct })}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={pct === 100 ? 'h-full bg-success' : 'h-full bg-primary'}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

/**
 * SCREEN-OPS — Languages (SRS-I18N-001, FR-GBL-002, DEC-024). Add, order, activate and pick the
 * default language; translating happens on the translations page. Adding a language and
 * publishing its strings needs no code change — the switcher is driven by `GET /meta/locales`.
 */
export function LanguagesPage() {
  const { t } = useI18n();
  const canManage = useAuth().hasPermission('config.publish');
  const { state, update } = useListParams(PARAMS);
  const status: Status = (STATUSES as readonly string[]).includes(state.status)
    ? (state.status as Status)
    : 'all';
  const [modal, setModal] = useState<Modal | null>(null);

  const locales = useAdminLocales();
  const completeness = useTranslationCompleteness();
  const act = useLocaleAction();
  const del = useDeleteLocale();
  const all = useMemo(() => locales.data ?? [], [locales.data]);

  const inStatus = (l: AdminLocale, s: Status) => s === 'all' || (s === 'on') === l.isActive;
  const count = (s: Status) => all.filter((l) => inStatus(l, s)).length;
  const visible = useMemo(() => all.filter((l) => inStatus(l, status)), [all, status]);
  const { pageRows, pagination } = useClientPage(visible, state, update);

  const coverage = (code: string): number | null => {
    const rows = (completeness.data?.rows ?? []).filter((r) => r.locale === code);
    if (!rows.length) return null;
    const total = rows.reduce((a, b) => a + b.total, 0);
    const published = rows.reduce((a, b) => a + b.published, 0);
    return total ? Math.round((published / total) * 100) : 100;
  };

  const activate = async (l: AdminLocale) => {
    try {
      await act.mutateAsync({ code: l.code, action: 'activate' });
      toast.success(t('ops.languages.activated', { code: l.code }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.languages.actionFail'));
    }
  };

  const menu = (l: AdminLocale) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem asChild>
            <Link to={`${paths.translations}?locale=${l.code}`}>
              <Type aria-hidden="true" />
              {t('ops.languages.edit')}
            </Link>
          </DropdownMenuItem>
          {canManage ? (
            <>
              <DropdownMenuItem onSelect={() => setModal({ kind: 'dialog', locale: l })}>
                <Pencil aria-hidden="true" />
                {t('ops.languages.editDetails')}
              </DropdownMenuItem>
              {!l.isDefault ? (
                <>
                  <DropdownMenuSeparator />
                  {l.isActive ? (
                    <DropdownMenuItem onSelect={() => setModal({ kind: 'deactivate', locale: l })}>
                      <PowerOff aria-hidden="true" />
                      {t('ops.languages.deactivate')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => void activate(l)}>
                      <Power aria-hidden="true" />
                      {t('ops.languages.activate')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setModal({ kind: 'default', locale: l })}>
                    <Star aria-hidden="true" />
                    {t('ops.languages.makeDefault')}
                  </DropdownMenuItem>
                  {!l.isActive && !SUPPORTED_LOCALE_CODES.includes(l.code) ? (
                    <DropdownMenuItem
                      onSelect={() => setModal({ kind: 'delete', locale: l })}
                      className="text-destructive focus:text-destructive"
                      data-testid={`lang-delete-${l.code}`}
                    >
                      <Trash2 aria-hidden="true" />
                      {t('action.delete')}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const badges = (l: AdminLocale) => (
    <span className="flex flex-wrap items-center gap-1.5">
      {l.isDefault ? (
        <Badge variant="default">
          <Star className="me-1 size-3" aria-hidden="true" />
          {t('ops.languages.default')}
        </Badge>
      ) : null}
      <Badge variant={l.isActive ? 'success' : 'secondary'}>
        {t(l.isActive ? 'ops.languages.on' : 'ops.languages.off')}
      </Badge>
    </span>
  );

  const columns = useMemo<ColumnDef<AdminLocale, unknown>[]>(
    () => [
      {
        id: 'language',
        header: t('ops.languages.title'),
        cell: ({ row: { original: l } }) => (
          <span>
            <bdi className="block font-medium">{l.nativeName}</bdi>
            <span className="block text-xs text-muted-foreground">{l.englishName}</span>
          </span>
        ),
      },
      {
        id: 'code',
        header: t('ops.languages.code'),
        cell: ({ row: { original: l } }) => (
          <code className="bidi-isolate rounded bg-muted px-1.5 py-0.5 text-xs">{l.code}</code>
        ),
      },
      {
        id: 'direction',
        header: t('ops.languages.direction'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: l } }) => (
          <Badge variant="outline">{l.direction.toUpperCase()}</Badge>
        ),
      },
      {
        id: 'coverage',
        header: t('ops.languages.coverageHeader'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: l } }) => <Coverage pct={coverage(l.code)} />,
      },
      { id: 'status', header: t('ops.tbl.status'), cell: ({ row: { original: l } }) => badges(l) },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: l } }) => menu(l),
      },
    ],

    [t, canManage, completeness.data],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };
  const cov = modal?.kind === 'default' ? coverage(modal.locale.code) : null;

  return (
    <Page>
      <PageHeader
        title={t('ops.languages.title')}
        description={t('ops.languages.subtitle')}
        actions={
          canManage ? (
            <Button
              onClick={() => setModal({ kind: 'dialog', locale: null })}
              data-testid="lang-new"
            >
              <Plus aria-hidden="true" />
              {t('ops.languages.add')}
            </Button>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <StateSwitcher
          label={t('ops.tbl.status')}
          value={status}
          onChange={(v) => update({ status: v === 'all' ? '' : v })}
          testIdPrefix="lang-status"
          options={[
            { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
            { value: 'on', label: `${t('ops.languages.on')} (${count('on')})` },
            { value: 'off', label: `${t('ops.languages.off')} (${count('off')})` },
          ]}
        />
      </Card>

      <section aria-label={t('ops.languages.title')} data-testid="languages-table">
        <DataTable
          label={t('ops.languages.title')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={locales.isLoading}
          fetching={locales.isFetching}
          bodyTestId="languages-rows"
          renderCard={(l) => (
            <div className="flex items-start gap-3 p-4" data-testid={`lang-row-${l.code}`}>
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block">
                  <bdi className="font-medium">{l.nativeName}</bdi>
                  <span className="ms-2 text-xs text-muted-foreground">{l.englishName}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <code className="bidi-isolate rounded bg-muted px-1.5 py-0.5">{l.code}</code>
                  <Badge variant="outline">{l.direction.toUpperCase()}</Badge>
                  {badges(l)}
                </span>
                <Coverage pct={coverage(l.code)} />
              </div>
              {menu(l)}
            </div>
          )}
          error={
            locales.isError ? (
              <StateView
                kind="error"
                title={t('ops.languages.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void locales.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={Languages} title={t('ops.cat.noMatch')} className="py-14" />}
          pagination={pagination}
        />
      </section>

      {modal?.kind === 'dialog' ? (
        <LanguageDialog
          locale={modal.locale}
          existingCodes={all.map((l) => l.code)}
          open
          onOpenChange={close}
        />
      ) : null}

      {modal?.kind === 'deactivate' || modal?.kind === 'default' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive={modal.kind === 'deactivate'}
          title={t(
            modal.kind === 'default'
              ? 'ops.languages.defaultTitle'
              : 'ops.languages.deactivateTitle',
            { code: modal.locale.code },
          )}
          description={
            <span className="block space-y-3">
              <span className="block">
                {t(
                  modal.kind === 'default'
                    ? 'ops.languages.defaultBody'
                    : 'ops.languages.deactivateBody',
                )}
              </span>
              {modal.kind === 'default' && (cov == null || cov < 100) ? (
                <Alert variant="warning">
                  <AlertDescription>
                    {cov == null
                      ? t('ops.languages.defaultUntranslated')
                      : t('ops.languages.defaultPartial', { pct: cov })}
                  </AlertDescription>
                </Alert>
              ) : null}
            </span>
          }
          confirmLabel={t(
            modal.kind === 'default' ? 'ops.languages.makeDefault' : 'ops.languages.deactivate',
          )}
          onConfirm={async () => {
            const res = await act.mutateAsync({
              code: modal.locale.code,
              action: modal.kind as 'deactivate' | 'default',
              force: modal.kind === 'default',
            });
            toast.success(
              t(
                modal.kind === 'default' ? 'ops.languages.defaulted' : 'ops.languages.deactivated',
                { code: modal.locale.code, n: res.reassigned ?? 0 },
              ),
            );
          }}
        />
      ) : null}

      {modal?.kind === 'delete' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={t('ops.languages.deleteTitle', { code: modal.locale.code })}
          description={t('ops.languages.deleteBody')}
          confirmLabel={t('action.delete')}
          onConfirm={async () => {
            await del.mutateAsync(modal.locale.code);
            toast.success(t('ops.languages.deleted', { code: modal.locale.code }));
          }}
        />
      ) : null}
    </Page>
  );
}
