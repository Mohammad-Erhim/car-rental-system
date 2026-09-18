import { useAuth } from '@carrental/client/react';
import type { LookupValue } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DeactivateDialog } from './deactivate-dialog';
import { useLookupMutations } from './use-lookup-mutations';
import { ValueSheet, type ActiveLocale } from './value-sheet';

import { DataTable } from '@/components/data-table/data-table';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError } from '@/lib/api';
import { useLookupValues, useMetaLocales } from '@/lib/api-hooks';
import { cn } from '@/lib/utils';

const getRowId = (v: LookupValue) => v.id;

/** Small "EN FR AR" line under a label showing which locales have their own translation. */
function LocaleCoverage({
  translations,
  locales,
}: {
  translations: Record<string, string>;
  locales: ActiveLocale[];
}) {
  if (locales.length <= 1) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1.5 text-[0.7rem] font-semibold uppercase">
      {locales.map((l) => (
        <span
          key={l.code}
          className={cn(
            translations?.[l.code]?.trim() ? 'text-foreground/70' : 'text-muted-foreground/50',
          )}
        >
          {l.code}
        </span>
      ))}
    </span>
  );
}

type Modal =
  | { kind: 'edit'; value: LookupValue }
  | { kind: 'create' }
  | { kind: 'deactivate'; value: LookupValue };

/**
 * One reference type's values: their order, labels (with translation coverage), state and the
 * edit / deactivate / restore actions. Read-only (system) types show why and offer no edits.
 */
export function ValuesPanel({ typeCode }: { typeCode: string }) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('lookup.manage');
  const values = useLookupValues(typeCode, { locale: 'en', includeInactive: true });
  const localesQuery = useMetaLocales();
  const { setActive, reorder } = useLookupMutations(typeCode);
  const [modal, setModal] = useState<Modal | null>(null);

  const rows = useMemo(() => values.data?.values ?? [], [values.data]);
  const type = values.data?.type;
  const readOnly = type?.editability === 'read_only';
  // edit affordances only once the list has actually loaded — never over a failed/loading fetch
  const editable = canManage && !readOnly && !!values.data;

  // en first, then the other active launch locales; drop test-only locales
  const locales = useMemo<ActiveLocale[]>(() => {
    const all = (localesQuery.data?.locales ?? [])
      .filter((l) => !l.testOnly)
      .map((l) => ({ code: l.code, englishName: l.englishName }));
    if (!all.some((l) => l.code === 'en')) all.unshift({ code: 'en', englishName: 'English' });
    return all.sort((a, b) =>
      a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.code.localeCompare(b.code),
    );
  }, [localesQuery.data]);

  const fail = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : t('ops.ref.actionFail'));

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= rows.length || reorder.isPending) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to]!, next[index]!];
    reorder.mutate(
      next.map((v, i) => ({ id: v.id, sortOrder: i })),
      { onSuccess: () => toast.success(t('ops.ref.reordered')), onError: fail },
    );
  };
  const restore = (v: LookupValue) =>
    setActive.mutate(
      { id: v.id, active: true },
      { onSuccess: () => toast.success(t('ops.ref.restored')), onError: fail },
    );

  const columns = useMemo<ColumnDef<LookupValue, unknown>[]>(
    () => [
      ...(editable
        ? [
            {
              id: 'order',
              header: () => <span className="sr-only">{t('ops.ref.moveUp')}</span>,
              meta: { className: 'w-14' },
              cell: ({ row: { original: v } }: { row: { original: LookupValue } }) => {
                const i = rows.findIndex((r) => r.id === v.id);
                return (
                  <span className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                      aria-label={t('ops.ref.moveUp')}
                      disabled={i <= 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                      aria-label={t('ops.ref.moveDown')}
                      disabled={i < 0 || i >= rows.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                );
              },
            } satisfies ColumnDef<LookupValue, unknown>,
          ]
        : []),
      {
        id: 'code',
        header: t('ops.tbl.code'),
        cell: ({ row: { original: v } }) => (
          <span className="bidi-isolate font-mono text-xs">{v.code}</span>
        ),
      },
      {
        id: 'label',
        header: t('ops.ref.labelEn'),
        cell: ({ row: { original: v } }) => (
          <div>
            <p className="font-medium">{v.label}</p>
            <LocaleCoverage translations={v.translations} locales={locales} />
          </div>
        ),
      },
      {
        id: 'state',
        header: t('ops.tbl.state'),
        cell: ({ row: { original: v } }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={v.isActive ? 'success' : 'secondary'}>
              {v.isActive ? t('ops.ref.active') : t('ops.ref.inactive')}
            </Badge>
            {v.isDefault ? <Badge variant="default">{t('ops.ref.default')}</Badge> : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: v } }) =>
          editable ? (
            <RowMenu
              v={v}
              onEdit={() => setModal({ kind: 'edit', value: v })}
              onDeactivate={() => setModal({ kind: 'deactivate', value: v })}
              onRestore={() => restore(v)}
            />
          ) : null,
      },
    ],

    [t, editable, rows, locales, reorder.isPending],
  );

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="bidi-isolate font-mono text-lg font-semibold">{typeCode}</h2>
            {type ? (
              <Badge variant="secondary" className="capitalize">
                {type.classification.replace(/_/g, ' ')}
              </Badge>
            ) : null}
            {readOnly ? (
              <Badge variant="warning">
                <Lock aria-hidden="true" />
                {t('ops.ref.readOnly')}
              </Badge>
            ) : null}
          </div>
          {type?.description ? (
            <p className="text-sm text-muted-foreground">{type.description}</p>
          ) : null}
        </div>
        {editable ? (
          <Button onClick={() => setModal({ kind: 'create' })} data-testid="add-value">
            <Plus aria-hidden="true" />
            {t('ops.ref.addValueBtn')}
          </Button>
        ) : null}
      </div>

      {readOnly && type?.lockReason ? (
        <Alert variant="info">
          <Lock aria-hidden="true" />
          <AlertDescription>{type.lockReason}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        label={typeCode}
        columns={columns}
        data={rows}
        getRowId={getRowId}
        loading={values.isLoading}
        fetching={values.isFetching}
        bodyTestId="lookup-value-rows"
        renderCard={(v) => (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 space-y-1.5">
              <p className="font-medium">{v.label}</p>
              <p className="bidi-isolate font-mono text-xs text-muted-foreground">{v.code}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant={v.isActive ? 'success' : 'secondary'}>
                  {v.isActive ? t('ops.ref.active') : t('ops.ref.inactive')}
                </Badge>
                {v.isDefault ? <Badge>{t('ops.ref.default')}</Badge> : null}
              </div>
            </div>
            {editable ? (
              <RowMenu
                v={v}
                onEdit={() => setModal({ kind: 'edit', value: v })}
                onDeactivate={() => setModal({ kind: 'deactivate', value: v })}
                onRestore={() => restore(v)}
              />
            ) : null}
          </div>
        )}
        error={
          values.isError ? (
            <StateView
              kind="error"
              title={t('ops.ref.loadValuesFail')}
              actionLabel={t('ops.st.retry')}
              onAction={() => void values.refetch()}
              className="py-14"
            />
          ) : undefined
        }
        empty={<StateView icon={ListChecks} title={t('ops.ref.noValues')} className="py-14" />}
      />

      {modal?.kind === 'create' || modal?.kind === 'edit' ? (
        <ValueSheet
          typeCode={typeCode}
          locales={locales}
          existingCodes={rows.map((r) => r.code)}
          value={modal.kind === 'edit' ? modal.value : null}
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === 'deactivate' ? (
        <DeactivateDialog
          typeCode={typeCode}
          value={modal.value}
          open
          onOpenChange={(o) => {
            if (!o) setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RowMenu({
  v,
  onEdit,
  onDeactivate,
  onRestore,
}: {
  v: LookupValue;
  onEdit: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('ops.resv.moreActions')}
          data-testid={`menu-${v.code}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit} data-testid={`edit-${v.code}`}>
          <Pencil aria-hidden="true" />
          {t('ops.ref.edit')}
        </DropdownMenuItem>
        {v.systemManaged ? null : v.isActive ? (
          <DropdownMenuItem
            onSelect={onDeactivate}
            data-testid={`deactivate-${v.code}`}
            className="text-destructive focus:text-destructive"
          >
            <Power aria-hidden="true" />
            {t('ops.ref.deactivate')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onRestore} data-testid={`restore-${v.code}`}>
            <RotateCcw aria-hidden="true" />
            {t('ops.ref.restore')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
