import { useAuth } from '@carrental/client/react';
import type { TranslationEntry } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Languages, Rocket, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { TranslateDialog } from './translate-dialog';
import { editorPath, inBucket, matchesQuery, type Bucket } from './translation-model';

import { paths } from '@/app/paths';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BreadcrumbLabelSetter } from '@/layouts/breadcrumb-label';
import {
  usePublishTranslations,
  useTranslationCompleteness,
  useTranslationList,
} from '@/lib/api-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';
import { useSearchBox } from '@/lib/use-search-box';

const PARAMS = ['tab', 'q'] as const;
const TABS: Bucket[] = ['todo', 'review', 'published', 'all'];
const getRowId = (e: TranslationEntry) => e.key;

function EntryStatus({ e }: { e: TranslationEntry }) {
  const { t } = useI18n();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant={
          e.status === 'published' ? 'success' : e.status === 'in_review' ? 'default' : 'secondary'
        }
        data-testid={`translation-status-${e.key}`}
      >
        {t(`ops.trans.state.${e.status}`)}
      </Badge>
      {e.outdated ? <Badge variant="warning">{t('ops.trans.outdated')}</Badge> : null}
    </span>
  );
}

/**
 * The strings of one namespace in one language: find one, translate it in a dialog, then publish
 * what is in review. `lookup.manage` alone may draft and review `lookup:*` strings but never
 * publish — the same gate the API applies.
 */
export function TranslationEditorPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { namespace = '', locale = '' } = useParams();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const canEdit = canPublish || (hasPermission('lookup.manage') && namespace.startsWith('lookup:'));
  const { state, update } = useListParams(PARAMS);
  const tab: Bucket = (TABS as string[]).includes(state.tab) ? (state.tab as Bucket) : 'todo';
  const box = useSearchBox(state.q, (q) => update({ q }));
  const [editing, setEditing] = useState<TranslationEntry | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const completeness = useTranslationCompleteness();
  const entries = useTranslationList(namespace, locale);
  const publish = usePublishTranslations();
  const all = useMemo(() => entries.data ?? [], [entries.data]);

  const namespaces = useMemo(
    () => [...new Set((completeness.data?.rows ?? []).map((r) => r.namespace))],
    [completeness.data],
  );
  const locales = (completeness.data?.locales ?? []).filter((l) => l !== 'en');

  const searched = useMemo(() => all.filter((e) => matchesQuery(e, state.q)), [all, state.q]);
  const count = (b: Bucket) => searched.filter((e) => inBucket(e, b)).length;
  const visible = useMemo(() => searched.filter((e) => inBucket(e, tab)), [searched, tab]);
  const { pageRows, pagination } = useClientPage(visible, state, update);
  const pendingCount = all.filter((e) => e.status === 'in_review').length;

  const columns = useMemo<ColumnDef<TranslationEntry, unknown>[]>(
    () => [
      {
        id: 'key',
        header: t('ops.trans.key'),
        cell: ({ row: { original: e } }) => (
          <span className="bidi-isolate break-all font-mono text-xs">{e.key}</span>
        ),
      },
      {
        id: 'source',
        header: t('ops.trans.source'),
        cell: ({ row: { original: e } }) => (
          <span className="line-clamp-2 max-w-xs text-muted-foreground">{e.source}</span>
        ),
      },
      {
        id: 'translation',
        header: t('ops.trans.translation'),
        cell: ({ row: { original: e } }) =>
          e.translation ? (
            <span className="line-clamp-2 max-w-xs" dir="auto">
              {e.translation}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: e } }) => <EntryStatus e={e} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-28 text-end' },
        cell: ({ row: { original: e } }) =>
          canEdit ? (
            <Button
              size="sm"
              variant="outline"
              data-testid={`translation-edit-${e.key}`}
              onClick={(ev) => {
                ev.stopPropagation();
                setEditing(e);
              }}
            >
              {t('ops.trans.translate')}
            </Button>
          ) : null,
      },
    ],
    [t, canEdit],
  );

  const pick = (ns: string, loc: string) => navigate(editorPath(ns, loc));
  const close = (o: boolean) => {
    if (!o) setEditing(null);
  };

  return (
    <Page>
      <BreadcrumbLabelSetter label={`${namespace} · ${locale.toUpperCase()}`} />
      <div className="-mb-2">
        <Button variant="ghost" size="sm" className="-ms-2.5 text-muted-foreground" asChild>
          <Link to={paths.translations}>
            <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
            {t('ops.trans.title')}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={<span className="bidi-isolate font-mono text-2xl sm:text-3xl">{namespace}</span>}
        badge={<Badge variant="outline">{locale.toUpperCase()}</Badge>}
        description={t('ops.trans.editorHint')}
        actions={
          canPublish ? (
            <Button
              onClick={() => setConfirmPublish(true)}
              disabled={pendingCount === 0}
              data-testid="translation-publish"
            >
              <Rocket aria-hidden="true" />
              {pendingCount > 0
                ? t('ops.trans.publishN', { n: pendingCount })
                : t('ops.trans.publish')}
            </Button>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <StateSwitcher
            label={t('ops.trans.strings')}
            value={tab}
            onChange={(v) => update({ tab: v === 'todo' ? '' : v })}
            testIdPrefix="trans-tab"
            options={[
              { value: 'todo', label: `${t('ops.trans.needsWork')} (${count('todo')})` },
              { value: 'review', label: `${t('ops.trans.state.in_review')} (${count('review')})` },
              {
                value: 'published',
                label: `${t('ops.trans.state.published')} (${count('published')})`,
              },
              { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={namespace} onValueChange={(v) => pick(v, locale)}>
              <SelectTrigger className="w-full sm:w-56" aria-label={t('ops.tbl.namespace')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {namespaces.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locale} onValueChange={(v) => pick(namespace, v)}>
              <SelectTrigger className="w-28" aria-label={t('ops.tbl.language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="border-t bg-muted/20 p-4 sm:px-5">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="ps-9"
              value={box.draft}
              onChange={(e) => box.setDraft(e.target.value)}
              placeholder={t('ops.trans.filterPlaceholder')}
              aria-label={t('ops.trans.filterPlaceholder')}
              data-testid="translation-search"
            />
          </div>
        </div>
      </Card>

      <section aria-label={t('ops.trans.strings')}>
        <DataTable
          label={t('ops.trans.strings')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={entries.isLoading}
          fetching={entries.isFetching}
          bodyTestId="translation-entries"
          onRowClick={canEdit ? setEditing : undefined}
          renderCard={(e) => (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setEditing(e)}
              data-key={e.key}
              className="block w-full space-y-1.5 p-4 text-start"
            >
              <span className="bidi-isolate block break-all font-mono text-xs text-muted-foreground">
                {e.key}
              </span>
              <span className="block text-sm">{e.source}</span>
              <span className="block text-sm text-muted-foreground" dir="auto">
                {e.translation ?? '—'}
              </span>
              <EntryStatus e={e} />
            </button>
          )}
          error={
            entries.isError ? (
              <StateView
                kind="error"
                title={t('ops.trans.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void entries.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={Languages} title={t('ops.cat.noMatch')} className="py-14" />}
          pagination={pagination}
        />
      </section>

      {editing ? (
        <TranslateDialog
          key={editing.key}
          entry={editing}
          namespace={namespace}
          locale={locale}
          onConflict={() => void entries.refetch()}
          open
          onOpenChange={close}
        />
      ) : null}

      {confirmPublish ? (
        <ConfirmDialog
          open
          onOpenChange={setConfirmPublish}
          title={t('ops.trans.publishTitle')}
          description={t('ops.trans.publishBody', { n: pendingCount, locale })}
          confirmLabel={t('ops.trans.publish')}
          onConfirm={async () => {
            const res = await publish.mutateAsync({ namespace, locale });
            toast.success(t('ops.trans.published', { n: res.published }));
          }}
        />
      ) : null}
    </Page>
  );
}
