import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  History,
  MailPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  UserX,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { StaffSheet } from './staff-sheet';

import { paths } from '@/app/paths';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  useResendStaffInvite,
  useStaffAccessChange,
  useStaffList,
  useStaffRoles,
  type StaffRow,
} from '@/lib/admin-hooks';
import { useLocationScope } from '@/lib/location-scope';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';
import { useSearchBox } from '@/lib/use-search-box';

const PARAMS = ['status', 'q'] as const;
const STATUSES = ['all', 'active', 'invited', 'suspended', 'deactivated'] as const;
type Status = (typeof STATUSES)[number];
const TONE: Record<StaffRow['status'], BadgeProps['variant']> = {
  invited: 'secondary',
  active: 'success',
  suspended: 'warning',
  deactivated: 'destructive',
};
const getRowId = (s: StaffRow) => s.accountId;

type Modal =
  | { kind: 'sheet'; staff: StaffRow | null }
  | { kind: 'suspend' | 'deactivate'; staff: StaffRow };

/** SCREEN-OPS-032 — Staff & roles (FR-ADM-009, FLOW-OPS-015). Invite, change access, suspend or close an account. */
export function StaffPage() {
  const { t } = useI18n();
  const { state, update } = useListParams(PARAMS);
  const status: Status = (STATUSES as readonly string[]).includes(state.status)
    ? (state.status as Status)
    : 'all';
  const box = useSearchBox(state.q, (q) => update({ q }));
  const [modal, setModal] = useState<Modal | null>(null);

  const staff = useStaffList();
  const roles = useStaffRoles();
  const { nameOf: locationName } = useLocationScope();
  const resend = useResendStaffInvite();
  const access = useStaffAccessChange();
  const all = useMemo(() => staff.data ?? [], [staff.data]);

  const roleName = (code: string) => roles.data?.roles.find((r) => r.code === code)?.name ?? code;

  const q = state.q.toLowerCase();
  const searched = useMemo(
    () =>
      all.filter(
        (s) => !q || s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
      ),
    [all, q],
  );
  const count = (s: Status) => searched.filter((x) => s === 'all' || x.status === s).length;
  const visible = useMemo(
    () => searched.filter((x) => status === 'all' || x.status === status),
    [searched, status],
  );
  const { pageRows, pagination } = useClientPage(visible, state, update);

  const run = async (
    input: Parameters<typeof access.mutateAsync>[0],
    okKey: string,
  ): Promise<void> => {
    await access.mutateAsync(input);
    toast.success(t(okKey));
  };
  const reactivate = async (s: StaffRow) => {
    try {
      await run(
        {
          accountId: s.accountId,
          body: { status: 'active' },
          successKey: 'ops.staff.reactivatedMsg',
        },
        'ops.staff.reactivatedMsg',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.staff.statusFail'));
    }
  };
  const resendInvite = async (s: StaffRow) => {
    try {
      await resend.mutateAsync(s);
      toast.success(t('ops.staff.inviteResent'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.staff.statusFail'));
    }
  };

  const menu = (s: StaffRow) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem onSelect={() => setModal({ kind: 'sheet', staff: s })}>
            <Pencil aria-hidden="true" />
            {t('ops.staff.change')}
          </DropdownMenuItem>
          {s.status === 'invited' ? (
            <DropdownMenuItem onSelect={() => void resendInvite(s)}>
              <MailPlus aria-hidden="true" />
              {t('ops.staff.resendInvite')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link
              to={`${paths.audit}?targetType=account&targetId=${encodeURIComponent(s.accountId)}`}
            >
              <History aria-hidden="true" />
              {t('ops.staff.history')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {s.status === 'suspended' || s.status === 'deactivated' ? (
            <DropdownMenuItem onSelect={() => void reactivate(s)}>
              <Power aria-hidden="true" />
              {t('ops.staff.reactivate')}
            </DropdownMenuItem>
          ) : null}
          {s.status === 'active' ? (
            <DropdownMenuItem onSelect={() => setModal({ kind: 'suspend', staff: s })}>
              <PowerOff aria-hidden="true" />
              {t('ops.staff.suspend')}
            </DropdownMenuItem>
          ) : null}
          {s.status === 'active' || s.status === 'suspended' ? (
            <DropdownMenuItem
              onSelect={() => setModal({ kind: 'deactivate', staff: s })}
              className="text-destructive focus:text-destructive"
            >
              <UserX aria-hidden="true" />
              {t('ops.staff.deactivate')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const statusBadge = (s: StaffRow) => (
    <Badge variant={TONE[s.status]}>{t(`ops.staff.status.${s.status}`)}</Badge>
  );
  const rolesBadges = (s: StaffRow) => (
    <span className="flex flex-wrap gap-1">
      {s.roleCodes.map((rc) => (
        <Badge key={rc} variant="outline">
          {roleName(rc)}
        </Badge>
      ))}
    </span>
  );

  const columns = useMemo<ColumnDef<StaffRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('ops.tbl.name'),
        cell: ({ row: { original: s } }) => (
          <span>
            <span className="block font-medium">{s.displayName}</span>
            <span className="bidi-isolate block text-xs text-muted-foreground">{s.email}</span>
          </span>
        ),
      },
      {
        id: 'roles',
        header: t('ops.tbl.roles'),
        cell: ({ row: { original: s } }) => rolesBadges(s),
      },
      {
        id: 'scope',
        header: t('ops.tbl.location'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: s } }) => (
          <span className="text-muted-foreground">
            {s.locationScope.length
              ? s.locationScope.map(locationName).join(', ')
              : t('ops.header.allLocations')}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: s } }) => statusBadge(s),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: s } }) => menu(s),
      },
    ],

    [t, roles.data, locationName],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.staff.title')}
        description={t('ops.staff.subtitle')}
        actions={
          <Button
            onClick={() => setModal({ kind: 'sheet', staff: null })}
            data-testid="staff-invite"
          >
            <Plus aria-hidden="true" />
            {t('ops.staff.invite')}
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <StateSwitcher
            label={t('ops.tbl.status')}
            value={status}
            onChange={(v) => update({ status: v === 'all' ? '' : v })}
            testIdPrefix="staff-status"
            options={STATUSES.map((s) => ({
              value: s,
              label: `${s === 'all' ? t('ops.rp.tabAll') : t(`ops.staff.status.${s}`)} (${count(s)})`,
            }))}
          />
          <div className="relative w-full lg:max-w-xs">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="ps-9"
              value={box.draft}
              onChange={(e) => box.setDraft(e.target.value)}
              placeholder={t('ops.staff.searchPlaceholder')}
              aria-label={t('ops.staff.searchPlaceholder')}
            />
          </div>
        </div>
      </Card>

      <section aria-label={t('ops.staff.card')} data-testid="staff-table">
        <DataTable
          label={t('ops.staff.card')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={staff.isLoading}
          fetching={staff.isFetching}
          bodyTestId="staff-rows"
          renderCard={(s) => (
            <div className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="block font-medium">{s.displayName}</span>
                <span className="bidi-isolate block break-all text-xs text-muted-foreground">
                  {s.email}
                </span>
                {rolesBadges(s)}
                {statusBadge(s)}
              </div>
              {menu(s)}
            </div>
          )}
          error={
            staff.isError ? (
              <StateView
                kind="error"
                title={t('ops.staff.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void staff.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={Users} title={t('ops.cat.noMatch')} className="py-14" />}
          pagination={pagination}
        />
      </section>

      {modal?.kind === 'sheet' ? (
        <StaffSheet staff={modal.staff} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'suspend' || modal?.kind === 'deactivate' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={t(
            modal.kind === 'deactivate' ? 'ops.staff.deactivateTitle' : 'ops.staff.suspendTitle',
            { name: modal.staff.displayName },
          )}
          description={t(
            modal.kind === 'deactivate' ? 'ops.staff.deactivateBody' : 'ops.staff.suspendBody',
          )}
          confirmLabel={t(
            modal.kind === 'deactivate' ? 'ops.staff.deactivate' : 'ops.staff.suspend',
          )}
          onConfirm={() =>
            run(
              {
                accountId: modal.staff.accountId,
                body: { status: modal.kind === 'deactivate' ? 'deactivated' : 'suspended' },
                successKey: '',
              },
              modal.kind === 'deactivate' ? 'ops.staff.deactivatedMsg' : 'ops.staff.suspendedMsg',
            )
          }
        />
      ) : null}
    </Page>
  );
}
