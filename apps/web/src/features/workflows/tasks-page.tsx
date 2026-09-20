import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { CheckCheck, Clock, Inbox } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DecisionDialog } from './decision-dialog';
import { OutOfOffice } from './out-of-office';
import { RequestCard } from './request-card';
import { WorkflowStatusBadge, waitingText } from './workflow-status';

import { paths } from '@/app/paths';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useListParams } from '@/lib/use-list-params';
import {
  useDecide,
  useInbox,
  useRequests,
  type InboxItem,
  type RequestRow,
  type WorkflowDecision,
} from '@/lib/workflow-hooks';

type Tab = 'tasks' | 'requested' | 'away' | 'all';

/**
 * Tasks — everything that is waiting on me (approve, reject, send back, mark done), the requests I
 * made and where each one stands, and — for someone allowed to monitor — every request in the
 * organisation. Access to a task is by assignment: you see and decide what was asked of you.
 */
export function TasksPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const monitor = hasPermission('workflow.monitor');
  const { state, update } = useListParams(['tab'] as const);
  const tabs: Tab[] = monitor
    ? ['tasks', 'requested', 'away', 'all']
    : ['tasks', 'requested', 'away'];
  const tab: Tab = (tabs as string[]).includes(state.tab) ? (state.tab as Tab) : 'tasks';

  return (
    <Page>
      <PageHeader title={t('ops.wf.tasksTitle')} description={t('ops.wf.tasksSubtitle')} />
      <StateSwitcher
        label={t('ops.wf.tasksTitle')}
        value={tab}
        onChange={(v) => update({ tab: v === 'tasks' ? '' : v })}
        testIdPrefix="tasks-tab"
        options={tabs.map((v) => ({ value: v, label: t(`ops.wf.tab.${v}`) }))}
      />
      {tab === 'tasks' ? <Inbox_ /> : null}
      {tab === 'requested' ? <Requests scope="mine" /> : null}
      {tab === 'away' ? <OutOfOffice /> : null}
      {tab === 'all' ? <Requests scope="all" /> : null}
    </Page>
  );
}

function Inbox_() {
  const { t, fmt } = useI18n();
  const inbox = useInbox();
  const decide = useDecide();
  const [dialog, setDialog] = useState<{ item: InboxItem; decision: WorkflowDecision } | null>(
    null,
  );

  if (inbox.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (inbox.isError || !inbox.items) {
    return (
      <StateView
        kind="error"
        title={t('ops.wf.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void inbox.refetch()}
      />
    );
  }
  if (!inbox.items.length) {
    return (
      <StateView
        icon={CheckCheck}
        title={t('ops.wf.inboxEmpty')}
        description={t('ops.wf.inboxEmptyBody')}
      />
    );
  }
  return (
    <>
      <ul className="space-y-3" data-testid="wf-inbox">
        {inbox.items.map((item) => (
          <li key={item.taskId}>
            <RequestCard
              kicker={item.actionLabel}
              title={item.subjectLabel ?? item.actionLabel}
              byline={`${t('ops.wf.requestedBy', { who: item.initiatorLabel ?? '—' })} · ${fmt.dateTime(item.requestedAt)}`}
              href={paths.request(item.instanceId)}
              badges={
                <>
                  <Badge variant="secondary">{item.title}</Badge>
                  {item.dueAt ? (
                    <Badge variant={item.overdue ? 'destructive' : 'outline'}>
                      <Clock className="me-1 size-3" aria-hidden="true" />
                      {item.overdue
                        ? t('ops.wf.overdue')
                        : t('ops.wf.due', { when: fmt.dateTime(item.dueAt) })}
                    </Badge>
                  ) : null}
                  {item.onBehalfOfName ? (
                    <Badge variant="outline">
                      {t('ops.wfo.coveringFor', { name: item.onBehalfOfName })}
                    </Badge>
                  ) : null}
                  {!item.canDecide ? (
                    <Badge variant="outline">{t('ops.wf.notYourTurn')}</Badge>
                  ) : null}
                </>
              }
            >
              {item.canDecide
                ? item.decisions.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={d === 'approve' || d === 'complete' ? 'default' : 'outline'}
                      className={d === 'request_changes' ? 'col-span-2 sm:col-span-1' : undefined}
                      onClick={() => setDialog({ item, decision: d })}
                      data-testid={`wf-${d}-${item.taskId}`}
                    >
                      {t(`ops.wf.do.${d}`)}
                    </Button>
                  ))
                : null}
            </RequestCard>
          </li>
        ))}
      </ul>
      {inbox.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={inbox.isFetchingNextPage}
            onClick={() => void inbox.fetchNextPage()}
            data-testid="wf-load-more"
          >
            {t('ops.wf.loadMore')}
          </Button>
        </div>
      ) : null}
      {dialog ? (
        <DecisionDialog
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null);
          }}
          decision={dialog.decision}
          subject={dialog.item.subjectLabel ?? dialog.item.actionLabel}
          requireComment={dialog.item.requireComment}
          onSubmit={async (comment) => {
            await decide.mutateAsync({
              taskId: dialog.item.taskId,
              decision: dialog.decision,
              comment,
            });
            toast.success(t(`ops.wf.done.${dialog.decision}`));
          }}
        />
      ) : null}
    </>
  );
}

export function RequestList({ rows }: { rows: RequestRow[] }) {
  const { t, fmt } = useI18n();
  return (
    <ul className="space-y-3" data-testid="wf-requests">
      {rows.map((r) => (
        <li key={r.instanceId}>
          <RequestCard
            kicker={r.actionLabel}
            title={r.subjectLabel ?? r.actionLabel}
            byline={`${t('ops.wf.requestedBy', { who: r.initiatorLabel ?? '—' })} · ${fmt.dateTime(r.createdAt)}`}
            href={paths.request(r.instanceId)}
            badges={<WorkflowStatusBadge status={r.status} />}
            note={
              r.status === 'running' && r.stepName ? (
                waitingText(r, t)
              ) : r.lastError ? (
                <span className="text-destructive">{r.lastError}</span>
              ) : null
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function Requests({ scope }: { scope: 'mine' | 'all' }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'open' | ''>(scope === 'all' ? 'open' : '');
  const reqs = useRequests(scope, status || undefined);
  return (
    <div className="space-y-4">
      <StateSwitcher
        label={t('ops.wf.filter')}
        value={status || 'any'}
        onChange={(v) => setStatus(v === 'open' ? 'open' : '')}
        testIdPrefix="wf-filter"
        options={[
          { value: 'open', label: t('ops.wf.filterOpen') },
          { value: 'any', label: t('ops.wf.filterAll') },
        ]}
      />
      {reqs.isLoading ? <Skeleton className="h-40 rounded-xl" /> : null}
      {reqs.isError ? (
        <StateView
          kind="error"
          title={t('ops.wf.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void reqs.refetch()}
        />
      ) : null}
      {reqs.data && !reqs.data.length ? (
        <StateView icon={Inbox} title={t('ops.wf.requestsEmpty')} />
      ) : null}
      {reqs.data?.length ? <RequestList rows={reqs.data} /> : null}
    </div>
  );
}
