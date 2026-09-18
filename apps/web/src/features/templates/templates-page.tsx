import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Mail } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { templatePath } from './template-model';

import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTemplateGroups, type TemplateGroup } from '@/lib/admin-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = ['view'] as const;
const getRowId = (g: TemplateGroup) => `${g.key}:${g.channel}`;

function Languages({ g }: { g: TemplateGroup }) {
  const { t } = useI18n();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {g.locales.map((l) => (
        <Badge
          key={l.localeCode}
          variant={l.hasDraft ? 'default' : 'outline'}
          className="uppercase"
        >
          {l.localeCode}
          {l.hasDraft ? <span className="ms-1 sr-only">{t('ops.cfg.state.draft')}</span> : null}
        </Badge>
      ))}
      {g.missingLocales.length ? (
        <Badge
          variant="warning"
          title={t('ops.tpl.missingLocales', { list: g.missingLocales.join(', ') })}
        >
          <AlertTriangle className="me-1 size-3" aria-hidden="true" />
          {g.missingLocales.length}
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * SCREEN-OPS-033 / FR-ADM-011 — notification templates. One row per transactional message
 * (event + channel); opening one goes to its own page, where each language is written, previewed
 * and published and where its delivery rule lives.
 */
export function TemplatesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { state, update } = useListParams(PARAMS);
  const groups = useTemplateGroups();
  const all = useMemo(() => groups.data ?? [], [groups.data]);
  const attention = all.filter(
    (g) => g.missingLocales.length > 0 || g.locales.some((l) => l.hasDraft),
  );
  const view = state.view === 'attention' ? 'attention' : 'all';
  const visible = view === 'attention' ? attention : all;
  const { pageRows, pagination } = useClientPage(visible, state, update);
  const open = (g: TemplateGroup) => navigate(templatePath(g.key, g.channel));

  const columns = useMemo<ColumnDef<TemplateGroup, unknown>[]>(
    () => [
      {
        id: 'key',
        header: t('ops.tpl.event'),
        cell: ({ row: { original: g } }) => (
          <span className="bidi-isolate font-mono text-xs font-medium">{g.key}</span>
        ),
      },
      {
        id: 'channel',
        header: t('ops.tpl.channel'),
        cell: ({ row: { original: g } }) => <Badge variant="secondary">{g.channel}</Badge>,
      },
      {
        id: 'languages',
        header: t('ops.tpl.languages'),
        cell: ({ row: { original: g } }) => <Languages g={g} />,
      },
    ],
    [t],
  );

  return (
    <Page>
      <PageHeader title={t('ops.tpl.title')} description={t('ops.tpl.subtitle')} />

      <Card className="p-4 sm:p-5">
        <StateSwitcher
          label={t('ops.tpl.list')}
          value={view}
          onChange={(v) => update({ view: v === 'all' ? '' : v })}
          testIdPrefix="tpl-view"
          options={[
            { value: 'all', label: `${t('ops.rp.tabAll')} (${all.length})` },
            { value: 'attention', label: `${t('ops.tpl.attention')} (${attention.length})` },
          ]}
        />
      </Card>

      <section aria-label={t('ops.tpl.list')} data-testid="templates-table">
        <DataTable
          label={t('ops.tpl.list')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={groups.isLoading}
          fetching={groups.isFetching}
          bodyTestId="templates-rows"
          onRowClick={open}
          renderCard={(g) => (
            <button
              type="button"
              onClick={() => open(g)}
              className="block w-full space-y-2 p-4 text-start"
              data-testid={`tpl-row-${g.key}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="bidi-isolate break-all font-mono text-xs font-medium">
                  {g.key}
                </span>
                <Badge variant="secondary">{g.channel}</Badge>
              </span>
              <Languages g={g} />
            </button>
          )}
          error={
            groups.isError ? (
              <StateView
                kind="error"
                title={t('ops.tpl.loadError')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void groups.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={Mail} title={t('ops.cat.noMatch')} className="py-14" />}
          pagination={pagination}
        />
      </section>
    </Page>
  );
}
