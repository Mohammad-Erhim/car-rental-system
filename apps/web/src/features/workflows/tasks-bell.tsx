import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { paths } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { useTaskCount } from '@/lib/workflow-hooks';

/** The header bell: how many approvals are waiting for me. Refreshes on focus and every minute. */
export function TasksBell() {
  const { t } = useI18n();
  const { actor } = useAuth();
  const count = useTaskCount(actor?.kind === 'staff');
  const pending = count.data?.pending ?? 0;
  const overdue = count.data?.overdue ?? 0;
  return (
    <Button asChild variant="ghost" size="icon-sm" className="relative" data-testid="tasks-bell">
      <Link
        to={paths.tasks}
        aria-label={t(pending ? 'ops.wf.bellLabel' : 'ops.wf.bellNone', { n: pending })}
        title={t('ops.wf.myTasks')}
      >
        <Bell aria-hidden="true" />
        {pending ? (
          <span
            className={`absolute -end-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold leading-4 ${overdue ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}
            data-testid="tasks-bell-count"
          >
            {pending > 99 ? '99+' : pending}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
