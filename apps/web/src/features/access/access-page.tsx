import { useI18n } from '@carrental/i18n/react';

import { GroupsTab } from './groups-tab';
import { HistoryTab } from './history-tab';
import { PeopleTab } from './people-tab';
import { RolesTab } from './roles-tab';

import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { useListParams } from '@/lib/use-list-params';

const TABS = ['roles', 'people', 'teams', 'history'] as const;
type Tab = (typeof TABS)[number];

/**
 * Access — who can do what. Roles × permissions (edit), people × permissions (see, and give a
 * person a role or a one-off exception), teams, and a history of every change. All of it is data:
 * nothing here is fixed in code except the catalogue of things that can be governed.
 */
export function AccessPage() {
  const { t } = useI18n();
  const { state, update } = useListParams(['tab'] as const);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab) ? (state.tab as Tab) : 'roles';

  return (
    <Page>
      <PageHeader title={t('ops.access.title')} description={t('ops.access.subtitle')} />
      <StateSwitcher
        label={t('ops.access.title')}
        value={tab}
        onChange={(v) => update({ tab: v === 'roles' ? '' : v })}
        testIdPrefix="access-tab"
        options={TABS.map((v) => ({ value: v, label: t(`ops.access.tab.${v}`) }))}
      />
      {tab === 'roles' ? <RolesTab /> : null}
      {tab === 'people' ? <PeopleTab /> : null}
      {tab === 'teams' ? <GroupsTab /> : null}
      {tab === 'history' ? <HistoryTab /> : null}
    </Page>
  );
}
