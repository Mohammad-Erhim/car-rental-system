import { useI18n } from '@carrental/i18n/react';
import {
  Copy,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  UserSearch,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  cellState,
  groupTally,
  pendingCount,
  setGroup,
  toChanges,
  toggleCell,
  type Pending,
} from './matrix-model';
import { ReviewMatrixDialog } from './review-matrix-dialog';
import { CloneRoleDialog, RoleSheet } from './role-dialogs';
import { WhoCanDialog } from './who-can-dialog';

import { ChoiceTabs } from '@/components/choice-tabs';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  groupActions,
  useArchiveRole,
  useRoles,
  type PermissionAction,
  type RoleRow,
} from '@/lib/access-hooks';
import { cn } from '@/lib/utils';

type Modal =
  | { kind: 'role'; role: RoleRow | null }
  | { kind: 'clone'; role: RoleRow }
  | { kind: 'who'; action: PermissionAction }
  | { kind: 'review' };

const RISK_TONE: Record<string, 'secondary' | 'warning' | 'destructive'> = {
  normal: 'secondary',
  elevated: 'warning',
  high: 'destructive',
};

/**
 * Roles × permissions. Columns are roles, rows are permissions grouped by module and risk. Edits
 * are staged locally and only written after a review that says exactly what changes and for how
 * many people. System roles are locked (clone one to customise it).
 */
export function RolesTab() {
  const { t } = useI18n();
  const roles = useRoles();
  const archive = useArchiveRole();
  const [pending, setPending] = useState<Pending>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [mobileRole, setMobileRole] = useState<string | null>(null);

  const catalogue = roles.data?.permissionActions ?? [];
  const list = useMemo(
    () => (roles.data?.roles ?? []).filter((r) => showArchived || !r.archived),
    [roles.data, showArchived],
  );
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? catalogue.filter(
          (a) =>
            a.code.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle),
        )
      : catalogue;
    return groupActions(filtered);
  }, [catalogue, q]);
  const count = pendingCount(pending);
  const activeMobile = list.find((r) => r.code === mobileRole) ?? list[0];

  if (roles.isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (roles.isError || !roles.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.access.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void roles.refetch()}
      />
    );
  }

  const toggle = (role: RoleRow, action: string) =>
    setPending((p) => toggleCell(p, role, action, catalogue));
  const menu = (role: RoleRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('ops.access.roleMenu', { name: role.name })}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!role.locked ? (
          <DropdownMenuItem onSelect={() => setModal({ kind: 'role', role })}>
            <Pencil aria-hidden="true" />
            {t('ops.access.editRole')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => setModal({ kind: 'clone', role })}>
          <Copy aria-hidden="true" />
          {t('ops.access.cloneRole')}
        </DropdownMenuItem>
        {!role.locked ? (
          <DropdownMenuItem
            onSelect={async () => {
              try {
                await archive.mutateAsync({ code: role.code, archived: !role.archived });
                toast.success(t(role.archived ? 'ops.access.restored' : 'ops.access.archived'));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('ops.access.saveFail'));
              }
            }}
          >
            {role.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {role.archived ? t('ops.access.restoreRole') : t('ops.access.archiveRole')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const roleHeader = (role: RoleRow) => (
    <div className="flex min-w-[9rem] flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
        {role.locked ? (
          <Lock
            className="size-3.5 text-muted-foreground"
            aria-label={t('ops.access.systemRole')}
          />
        ) : null}
        <span className="font-medium">{role.name}</span>
        {menu(role)}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span className="bidi-isolate font-mono">{role.code}</span>
        <span>· {t('ops.access.holders', { n: role.holderCount })}</span>
        {role.archived ? <Badge variant="secondary">{t('ops.access.archivedTag')}</Badge> : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ops.access.searchActions')}
            aria-label={t('ops.access.searchActions')}
            className="ps-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          {t('ops.access.showArchived')}
        </label>
        <div className="ms-auto">
          <Button onClick={() => setModal({ kind: 'role', role: null })} data-testid="role-new">
            <Plus aria-hidden="true" />
            {t('ops.access.newRole')}
          </Button>
        </div>
      </div>

      {count ? (
        <div
          role="status"
          className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm"
          data-testid="matrix-pending"
        >
          <span className="text-sm font-medium">
            {t('ops.access.pending', { n: count, roles: Object.keys(pending).length })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPending({})}>
              {t('ops.access.discard')}
            </Button>
            <Button
              size="sm"
              onClick={() => setModal({ kind: 'review' })}
              data-testid="matrix-review"
            >
              {t('ops.access.review')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* desktop: the full grid */}
      <Card className="hidden overflow-hidden md:block">
        <Table data-testid="roles-matrix">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky start-0 z-10 min-w-[16rem] bg-background">
                {t('ops.access.permission')}
              </TableHead>
              {list.map((r) => (
                <TableHead key={r.code} className="align-top py-3">
                  {roleHeader(r)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Fragment key={g.group}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell className="sticky start-0 bg-muted/40 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.group}
                  </TableCell>
                  {list.map((r) => {
                    const tally = groupTally(r, g.actions, catalogue, pending);
                    return (
                      <TableCell key={r.code} className="py-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            disabled={r.locked}
                            checked={
                              tally.on === tally.total
                                ? true
                                : tally.on === 0
                                  ? false
                                  : 'indeterminate'
                            }
                            onCheckedChange={(v) =>
                              setPending((p) => setGroup(p, r, g.actions, v === true, catalogue))
                            }
                            aria-label={t('ops.access.toggleGroup', {
                              group: g.group,
                              role: r.name,
                            })}
                          />
                          {tally.on}/{tally.total}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
                {g.actions.map((a) => (
                  <TableRow key={a.code}>
                    <TableCell className="sticky start-0 bg-background">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="bidi-isolate font-mono text-xs">{a.code}</span>
                            <Badge variant={RISK_TONE[a.riskLevel] ?? 'secondary'}>
                              {t(`ops.access.risk.${a.riskLevel}`)}
                            </Badge>
                          </div>
                          <p className="mt-0.5 max-w-[26rem] text-xs text-muted-foreground">
                            {a.description}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setModal({ kind: 'who', action: a })}
                          aria-label={t('ops.access.whoCan', { action: a.code })}
                        >
                          <UserSearch aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                    {list.map((r) => {
                      const s = cellState(r, a.code, catalogue, pending);
                      const limit = r.conditions[a.code]?.amountMinorMax;
                      return (
                        <TableCell
                          key={r.code}
                          className={cn(
                            (s === 'adding' && 'bg-success/10') ||
                              (s === 'removing' && 'bg-destructive/10'),
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              disabled={r.locked}
                              checked={s === 'granted' || s === 'adding'}
                              onCheckedChange={() => toggle(r, a.code)}
                              aria-label={`${r.name}: ${a.code}`}
                              data-testid={`cell-${r.code}-${a.code}`}
                            />
                            {limit !== undefined && (s === 'granted' || s === 'adding') ? (
                              <Badge variant="outline" className="text-[10px]">
                                {t('ops.access.limitTag', { n: limit / 100 })}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* phone: one role at a time */}
      <div className="space-y-3 md:hidden">
        <ChoiceTabs
          value={activeMobile?.code ?? ''}
          onChange={setMobileRole}
          label={t('ops.access.pickRole')}
          testIdPrefix="roles-mobile"
          options={list.map((r) => ({ value: r.code, label: r.name }))}
        />
        {activeMobile ? (
          <Card className="p-4">
            <div className="mb-3">{roleHeader(activeMobile)}</div>
            {groups.map((g) => (
              <div key={g.group} className="mb-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.group}
                </p>
                <ul className="divide-y">
                  {g.actions.map((a) => {
                    const s = cellState(activeMobile, a.code, catalogue, pending);
                    return (
                      <li key={a.code} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <span className="bidi-isolate block truncate font-mono text-xs">
                            {a.code}
                          </span>
                          <span className="text-xs text-muted-foreground">{a.description}</span>
                        </div>
                        <Switch
                          disabled={activeMobile.locked}
                          checked={s === 'granted' || s === 'adding'}
                          onCheckedChange={() => toggle(activeMobile, a.code)}
                          aria-label={a.code}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </Card>
        ) : null}
      </div>

      {modal?.kind === 'role' ? (
        <RoleSheet role={modal.role} open onOpenChange={(o) => !o && setModal(null)} />
      ) : null}
      {modal?.kind === 'clone' ? (
        <CloneRoleDialog role={modal.role} open onOpenChange={(o) => !o && setModal(null)} />
      ) : null}
      {modal?.kind === 'who' ? (
        <WhoCanDialog action={modal.action} open onOpenChange={(o) => !o && setModal(null)} />
      ) : null}
      {modal?.kind === 'review' ? (
        <ReviewMatrixDialog
          changes={toChanges(pending)}
          roles={roles.data.roles}
          open
          onOpenChange={(o) => !o && setModal(null)}
          onApplied={() => {
            setPending({});
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}
