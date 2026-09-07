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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Translation catalogue</h1>
        <p className="text-sm text-muted-foreground">
          Coverage by language and namespace. Publishing a namespace is blocked while a mandatory
          legal string is still untranslated.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          {completeness.isLoading ? (
            <AppStateView kind="loading" title={t('state.loading.title')} inline />
          ) : completeness.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('state.failure.title')}
              primaryAction={{ label: t('action.retry'), onClick: () => completeness.refetch() }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm" data-testid="translation-coverage">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-medium">Namespace</th>
                    <th className="py-1 text-start font-medium">Language</th>
                    <th className="py-1 text-start font-medium">Coverage</th>
                    <th className="py-1 text-start font-medium">Missing</th>
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

  const selectClass =
    'flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  async function doPublish() {
    setPublishError(null);
    try {
      await publish.mutateAsync({ namespace, locale });
      void entries.refetch();
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Publish failed — please try again.');
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Strings</CardTitle>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Namespace"
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
            aria-label="Language"
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
              Publish reviewed
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
          <AppStateView kind="loading" title={t('state.loading.title')} inline />
        ) : entries.isError ? (
          <AppStateView
            kind="failure"
            inline
            title={t('state.failure.title')}
            primaryAction={{ label: t('action.retry'), onClick: () => entries.refetch() }}
          />
        ) : (
          <ul className="divide-y" data-testid="translation-entries">
            {entries.data!.map((row) => {
              const draft = drafts[row.key] ?? row.translation ?? '';
              return (
                <li key={row.key} className="space-y-1 py-3" data-key={row.key}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{row.key}</span>
                    <div className="flex items-center gap-1.5">
                      {row.outdated ? <Badge variant="warning">outdated</Badge> : null}
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
                      aria-label={`Translation for ${row.key}`}
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
                          Save draft
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
                          Mark reviewed
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
