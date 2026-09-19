import { useI18n } from '@carrental/i18n/react';
import { Check, Minus, Search, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

import { UserAccessSheet } from './user-access-sheet';

import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { groupActions, useUsersMatrix } from '@/lib/access-hooks';
import { cn } from '@/lib/utils';

/**
 * People × permissions: what each person can do RIGHT NOW (roles in force, minus denials, plus
 * one-off allows), and where each right comes from. Click a person to change their access.
 */
export function PeopleTab() {
  const { t } = useI18n();
  const m = useUsersMatrix();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => groupActions(m.data?.permissionActions ?? []), [m.data]);
  const staff = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (m.data?.staff ?? []).filter(
      (s) =>
        !needle ||
        s.displayName.toLowerCase().includes(needle) ||
        s.email.toLowerCase().includes(needle),
    );
  }, [m.data, q]);

  if (m.isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (m.isError || !m.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.access.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void m.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-sm">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ops.access.searchPeople')}
          aria-label={t('ops.access.searchPeople')}
          className="ps-9"
        />
      </div>

      <Card className="overflow-hidden">
        <Table data-testid="people-matrix">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky start-0 z-10 min-w-[14rem] bg-background">
                {t('ops.access.person')}
              </TableHead>
              {groups.map((g) => (
                <Fragment key={g.group}>
                  {g.actions.map((a, i) => (
                    <TableHead
                      key={a.code}
                      className={cn('h-40 w-9 min-w-9 p-1 align-bottom', i === 0 && 'border-s')}
                      title={`${a.code} — ${a.description}`}
                    >
                      <span className="bidi-isolate block font-mono text-[10px] [writing-mode:vertical-rl] rotate-180">
                        {a.code}
                      </span>
                    </TableHead>
                  ))}
                </Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow
                key={s.accountId}
                className="cursor-pointer"
                onClick={() => setOpen(s.accountId)}
                data-testid={`person-${s.email}`}
              >
                <TableCell className="sticky start-0 bg-background">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.roleCodes.join(', ') || t('ops.access.noRoles')}
                      </p>
                    </div>
                    {s.status !== 'active' ? (
                      <Badge variant="secondary">{t(`ops.staff.status.${s.status}`)}</Badge>
                    ) : null}
                  </div>
                </TableCell>
                {groups.map((g) =>
                  g.actions.map((a, i) => {
                    const has = s.permissions.includes(a.code);
                    const denied = s.denied.includes(a.code);
                    const via = (s.via[a.code] ?? []).join(', ');
                    const limit = s.conditions[a.code]?.amountMinorMax;
                    return (
                      <TableCell
                        key={a.code}
                        className={cn('p-1 text-center', i === 0 && 'border-s')}
                        title={
                          denied
                            ? `${a.code}: ${t('ops.access.deniedBy')} ${via}`
                            : has
                              ? `${a.code}: ${via}${limit !== undefined ? ` · ≤ ${limit / 100}` : ''}`
                              : a.code
                        }
                      >
                        {has ? (
                          <Check
                            className={cn(
                              'mx-auto size-4',
                              limit !== undefined ? 'text-warning' : 'text-success',
                            )}
                            aria-label={t('ops.access.can')}
                          />
                        ) : denied ? (
                          <X
                            className="mx-auto size-4 text-destructive"
                            aria-label={t('ops.access.denied')}
                          />
                        ) : (
                          <Minus
                            className="mx-auto size-3 text-muted-foreground/40"
                            aria-label={t('ops.access.cannot')}
                          />
                        )}
                      </TableCell>
                    );
                  }),
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">{t('ops.access.peopleLegend')}</p>

      {open ? (
        <UserAccessSheet accountId={open} open onOpenChange={(o) => !o && setOpen(null)} />
      ) : null}
    </div>
  );
}
