import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
} from '@carrental/ui';
import { useState } from 'react';

import {
  usePublishTranslations,
  useTranslationCompleteness,
  useTranslationList,
  useUpsertTranslation,
} from '../../lib/api-hooks.js';
import { ApiError } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';

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
  const ns = namespace || namespaces[0] || '';
  const loc = locale || locales[0] || '';

  const TH = ['namespace', 'language', 'coverage', 'missing'] as const;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.trans.title')} description={t('ops.trans.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.trans.coverage')}</CardTitle>
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
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    {TH.map((k) => (
                      <th key={k} className="py-1 text-start font-medium">
                        {t(`ops.tbl.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completeness.data!.rows.map((r) => (
                    <tr
                      key={`${r.namespace}:${r.locale}`}
                      className="border-t"
                      data-row={`${r.namespace}:${r.locale}`}
                    >
                      <td className="py-2 pe-2 font-mono text-xs">{r.namespace}</td>
                      <td className="py-2 pe-2">{r.locale}</td>
                      <td className="py-2 pe-2">
                        <Badge variant={r.coveragePct === 100 ? 'success' : 'warning'}>
                          {r.coveragePct}%
                        </Badge>
                      </td>
                      <td className="py-2 pe-2">{r.missing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {ns && loc ? (
        <NamespaceEditor
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
  const { t } = useI18n();
  const entries = useTranslationList(namespace, locale);
  const upsert = useUpsertTranslation();
  const publish = usePublishTranslations();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [publishError, setPublishError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);

  const allRows = entries.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allRows.filter(
        (r) => r.key.toLowerCase().includes(q) || (r.source ?? '').toLowerCase().includes(q),
      )
    : allRows;
  const visible = filtered.slice(0, limit);

  const selectClass =
    'flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  async function doPublish() {
    setPublishError(null);
    try {
      await publish.mutateAsync({ namespace, locale });
      void entries.refetch();
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : t('ops.trans.publishFail'));
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">{t('ops.trans.strings')}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label={t('ops.tbl.namespace')}
            className={selectClass}
            value={namespace}
            onChange={(e) => onPick(e.target.value, locale)}
          >
            {namespaces.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            aria-label={t('ops.tbl.language')}
            className={selectClass}
            value={locale}
            onChange={(e) => onPick(namespace, e.target.value)}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {canManage ? (
            <Button
              variant="outline"
              onClick={doPublish}
              loading={publish.isPending}
              data-testid="translation-publish"
            >
              {t('ops.trans.publish')}
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
                          {row.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.source}</p>
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
                            disabled={!draft || draft === row.translation}
                            onClick={() =>
                              upsert.mutate({
                                namespace,
                                key: row.key,
                                localeCode: locale,
                                value: draft,
                                status: 'draft',
                              })
                            }
                          >
                            {t('ops.trans.saveDraft')}
                          </Button>
                          <Button
                            size="sm"
                            disabled={!draft}
                            data-testid={`translation-review-${row.key}`}
                            onClick={() =>
                              upsert.mutate({
                                namespace,
                                key: row.key,
                                localeCode: locale,
                                value: draft,
                                status: 'in_review',
                              })
                            }
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
    </Card>
  );
}
