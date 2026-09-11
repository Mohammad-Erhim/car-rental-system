import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Input,
  PageHeader,
  Select,
  useToast,
} from '@carrental/ui';
import { useState } from 'react';

import {
  usePublishTranslations,
  useTranslationCompleteness,
  useTranslationList,
  useUpsertTranslation,
} from '../../lib/api-hooks.js';
import { ApiError } from '../../lib/api.js';

/**
 * SCREEN-OPS-034 — Translation catalogue (FR-ADM-012, SRS-I18N-003). Coverage by language +
 * namespace; per-key editor with draft → review → publish; publishing is blocked while a
 * mandatory legal string is untranslated (business rule surfaced, not a silent failure).
 */
export function TranslationsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('config.publish');
  const completeness = useTranslationCompleteness();

  const namespaces = Array.from(new Set((completeness.data?.rows ?? []).map((r) => r.namespace)));
  const locales = (completeness.data?.locales ?? []).filter((l) => l !== 'en');

  const [namespace, setNamespace] = useState<string>('');
  const [locale, setLocale] = useState<string>('');
  const [hideComplete, setHideComplete] = useState(true);
  const ns = namespace || namespaces[0] || '';
  const loc = locale || locales[0] || '';

  // pivot the per-(namespace, locale) rows into one row per namespace with a cell per language,
  // so the summary stays readable as the catalogue grows (UI strings + every reference-data type).
  type Cov = NonNullable<typeof completeness.data>['rows'][number];
  const byNs = new Map<string, Map<string, Cov>>();
  for (const r of completeness.data?.rows ?? []) {
    if (!byNs.has(r.namespace)) byNs.set(r.namespace, new Map());
    byNs.get(r.namespace)!.set(r.locale, r);
  }
  const pivot = [...byNs.entries()]
    .map(([name, cells]) => ({
      namespace: name,
      cells,
      gaps: locales.reduce((sum, l) => sum + (cells.get(l)?.missing ?? 0), 0),
    }))
    .sort((a, b) => b.gaps - a.gaps || a.namespace.localeCompare(b.namespace));
  const visiblePivot = hideComplete ? pivot.filter((row) => row.gaps > 0) : pivot;
  const totalGaps = pivot.reduce((sum, row) => sum + row.gaps, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.trans.title')} description={t('ops.trans.subtitle')} />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t('ops.trans.coverage')}</CardTitle>
          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <Checkbox
              checked={hideComplete}
              onChange={(e) => setHideComplete(e.target.checked)}
              data-testid="translation-hide-complete"
            />
            {t('ops.trans.hideComplete')}
          </label>
        </CardHeader>
        <CardContent>
          {completeness.isLoading ? (
            <AppStateView kind="loading" title={t('ops.st.loading')} inline />
          ) : completeness.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('ops.trans.loadFail')}
              primaryAction={{ label: t('ops.st.retry'), onClick: () => completeness.refetch() }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm" data-testid="translation-coverage">
                <thead>
                  <tr className="border-b text-start text-xs text-muted-foreground">
                    <th className="py-2 pe-3 text-start font-medium">{t('ops.tbl.namespace')}</th>
                    {locales.map((l) => (
                      <th key={l} className="px-2 py-2 text-start font-medium uppercase">
                        {l}
                      </th>
                    ))}
                    <th className="ps-2 py-2 text-start font-medium">{t('ops.tbl.missing')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visiblePivot.map((row) => (
                    <tr key={row.namespace} data-row={row.namespace}>
                      <td className="py-1.5 pe-3 font-mono text-xs">{row.namespace}</td>
                      {locales.map((l) => {
                        const c = row.cells.get(l);
                        const pct = c?.coveragePct ?? 0;
                        return (
                          <td key={l} className="px-2 py-1.5">
                            <button
                              type="button"
                              className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => {
                                setNamespace(row.namespace);
                                setLocale(l);
                              }}
                            >
                              <Badge variant={pct === 100 ? 'success' : 'warning'}>{pct}%</Badge>
                            </button>
                          </td>
                        );
                      })}
                      <td className="ps-2 py-1.5 tabular-nums">{row.gaps}</td>
                    </tr>
                  ))}
                  {visiblePivot.length === 0 ? (
                    <tr>
                      <td
                        colSpan={locales.length + 2}
                        className="py-4 text-center text-sm text-muted-foreground"
                      >
                        {totalGaps === 0 ? t('ops.trans.allComplete') : t('ops.st.none')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {ns && loc ? (
        <NamespaceEditor
          key={`${ns}:${loc}`}
          namespace={ns}
          locale={loc}
          namespaces={namespaces}
          locales={locales}
          canManage={canManage}
          onPick={(nextNs, nextLoc) => {
            setNamespace(nextNs);
            setLocale(nextLoc);
          }}
        />
      ) : null}
    </div>
  );
}

function NamespaceEditor({
  namespace,
  locale,
  namespaces,
  locales,
  canManage,
  onPick,
}: {
  namespace: string;
  locale: string;
  namespaces: string[];
  locales: string[];
  canManage: boolean;
  onPick: (ns: string, loc: string) => void;
}) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const entries = useTranslationList(namespace, locale);
  const upsert = useUpsertTranslation();
  const publish = usePublishTranslations();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const saveEntry = (
    key: string,
    value: string,
    status: 'draft' | 'in_review',
    expectedVersion: number,
  ) =>
    upsert.mutate(
      { namespace, key, localeCode: locale, value, status, expectedVersion },
      {
        onSuccess: () =>
          toast({
            title: status === 'draft' ? t('ops.trans.saved') : t('ops.trans.reviewed'),
            variant: 'success',
          }),
        onError: (err) => {
          // someone else changed this key since the editor loaded — pull the fresh value in
          if (err instanceof ApiError && err.code === 'state_conflict') {
            setDrafts((d) => {
              const { [key]: _drop, ...rest } = d;
              return rest;
            });
            void entries.refetch();
          }
          toast({ title: err instanceof ApiError ? err.message : t('ops.trans.saveFail') });
        },
      },
    );
  const savingKey = upsert.isPending ? upsert.variables?.key : undefined;
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);

  const allRows = entries.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allRows.filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          (r.source ?? '').toLowerCase().includes(q) ||
          (r.translation ?? '').toLowerCase().includes(q),
      )
    : allRows;
  const visible = filtered.slice(0, limit);
  const pendingCount = allRows.filter((r) => r.status === 'in_review').length;

  async function doPublish() {
    setPublishError(null);
    setConfirmPublish(false);
    try {
      const res = await publish.mutateAsync({ namespace, locale });
      void entries.refetch();
      toast({ title: t('ops.trans.published', { n: res.published }), variant: 'success' });
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : t('ops.trans.publishFail'));
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">{t('ops.trans.strings')}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('ops.tbl.namespace')}
            className="w-auto"
            value={namespace}
            onChange={(e) => onPick(e.target.value, locale)}
          >
            {namespaces.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('ops.tbl.language')}
            className="w-auto"
            value={locale}
            onChange={(e) => onPick(namespace, e.target.value)}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          {canManage ? (
            <Button
              variant="outline"
              onClick={() => setConfirmPublish(true)}
              loading={publish.isPending}
              disabled={pendingCount === 0}
              data-testid="translation-publish"
            >
              {pendingCount > 0
                ? t('ops.trans.publishN', { n: pendingCount })
                : t('ops.trans.publish')}
            </Button>
          ) : null}
        </div>
        {publishError ? (
          <p className="text-sm text-destructive" data-testid="translation-publish-error">
            {publishError}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {entries.isLoading ? (
          <AppStateView kind="loading" title={t('ops.st.loading')} inline />
        ) : entries.isError ? (
          <AppStateView
            kind="failure"
            inline
            title={t('ops.trans.loadFail')}
            primaryAction={{ label: t('ops.st.retry'), onClick: () => entries.refetch() }}
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Input
                className="max-w-xs"
                value={query}
                placeholder={t('ops.trans.filterPlaceholder')}
                aria-label={t('ops.trans.filterPlaceholder')}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(50);
                }}
              />
              <span className="text-xs text-muted-foreground">
                {t('ops.trans.showing', { shown: visible.length, total: filtered.length })}
              </span>
            </div>
            <ul className="divide-y" data-testid="translation-entries">
              {visible.map((row) => {
                const draft = drafts[row.key] ?? row.translation ?? '';
                return (
                  <li key={row.key} className="space-y-1 py-3" data-key={row.key}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs">{row.key}</span>
                      <div className="flex items-center gap-1.5">
                        {row.outdated ? (
                          <Badge variant="warning">{t('ops.trans.outdated')}</Badge>
                        ) : null}
                        <Badge
                          variant={row.status === 'published' ? 'success' : 'neutral'}
                          data-testid={`translation-status-${row.key}`}
                        >
                          {t(`ops.trans.state.${row.status}`)}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.source}</p>
                    {row.reviewedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t('ops.trans.reviewedAt', { date: fmt.dateTime(row.reviewedAt) })}
                      </p>
                    ) : null}
                    {row.published != null && row.published !== row.translation ? (
                      <p className="text-xs text-muted-foreground">
                        {t('ops.trans.liveNow', { value: row.published })}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="min-w-[16rem] flex-1"
                        value={draft}
                        aria-label={t('ops.trans.editAria', { key: row.key })}
                        disabled={!canManage}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      />
                      {canManage ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={savingKey === row.key}
                            disabled={!draft || draft === row.translation}
                            onClick={() => saveEntry(row.key, draft, 'draft', row.version)}
                          >
                            {t('ops.trans.saveDraft')}
                          </Button>
                          <Button
                            size="sm"
                            loading={savingKey === row.key}
                            disabled={
                              !draft || (row.status === 'in_review' && draft === row.translation)
                            }
                            data-testid={`translation-review-${row.key}`}
                            onClick={() => saveEntry(row.key, draft, 'in_review', row.version)}
                          >
                            {t('ops.trans.markReviewed')}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {filtered.length > visible.length ? (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + 100)}>
                  {t('ops.trans.showMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={t('ops.trans.publishTitle')}
        description={t('ops.trans.publishBody', { n: pendingCount, locale })}
        confirmLabel={t('ops.trans.publish')}
        confirmDisabled={publish.isPending}
        onConfirm={doPublish}
      />
    </Card>
  );
}
