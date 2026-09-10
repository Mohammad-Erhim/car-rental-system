import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  Field,
  PageHeader,
  Textarea,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { LookupSelect } from '../../components/lookup-select.js';
import { ApiError } from '../../lib/api.js';
import { useLocations } from '../../lib/discovery-hooks.js';
import {
  useAddFleetBlock,
  useFleetBlocks,
  useImportUnits,
  useOpsCategories,
  useOpsUnits,
  useReleaseFleetBlock,
  useTransferUnit,
  type FleetBlock,
  type OpsUnit,
  type UnitImportResult,
} from '../../lib/ops-discovery-hooks.js';

const IMPORT_HEADER = 'plate,vin,categoryCode,locationCode,year,make,model,colour';
const UNIT_STATES = ['available', 'on_rent', 'prep', 'maintenance', 'out_of_service'];
const BLOCK_KINDS = ['maintenance', 'damage', 'admin_block'] as const;

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const stateVariant = (s: string) =>
  s === 'available'
    ? 'success'
    : s === 'maintenance' || s === 'out_of_service'
      ? 'warning'
      : 'neutral';

const KNOWN_UNIT_STATES = new Set([
  'available',
  'on_rent',
  'prep',
  'maintenance',
  'out_of_service',
  'in_transit',
]);
const unitStateLabel = (t: (k: string) => string, s: string) =>
  KNOWN_UNIT_STATES.has(s) ? t(`ops.fleet.unitState.${s}`) : s.replace(/_/g, ' ');
const blockKindLabel = (t: (k: string) => string, k: string) =>
  BLOCK_KINDS.includes(k as (typeof BLOCK_KINDS)[number])
    ? t(`ops.fleet.blockKind.${k}`)
    : k.replace(/_/g, ' ');

/**
 * SCREEN-OPS-013 / 017 / 018 — Fleet inventory + operations. Units by location / category /
 * state (VIN / plate bidi-isolated); a `fleet.manage` holder can take a unit into maintenance
 * (removing it from availability) or transfer it. Confined to the actor's locations by the API.
 * Filters are URL-backed; the state filter is applied server-side.
 */
export function FleetInventoryPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fleet.manage');

  const [params, setParams] = useSearchParams();
  const locationCode = params.get('location') ?? '';
  const categoryCode = params.get('category') ?? '';
  const stateFilter = params.get('state') ?? '';
  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const units = useOpsUnits({
    locationCode: locationCode || undefined,
    categoryCode: categoryCode || undefined,
    state: stateFilter || undefined,
  });
  const locations = useLocations();
  const categories = useOpsCategories();
  const blocks = useFleetBlocks('active');
  const addBlock = useAddFleetBlock();
  const releaseBlock = useReleaseFleetBlock();
  const transfer = useTransferUnit();

  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [blockUnit, setBlockUnit] = useState<OpsUnit | null>(null);
  const [blockKind, setBlockKind] = useState<(typeof BLOCK_KINDS)[number]>('maintenance');
  const [blockReason, setBlockReason] = useState('');
  const [xferUnit, setXferUnit] = useState<OpsUnit | null>(null);
  const [xferTo, setXferTo] = useState('');
  const [releaseB, setReleaseB] = useState<FleetBlock | null>(null);

  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);
  const anyFilter = !!(locationCode || categoryCode || stateFilter);

  // active blocks keyed by unit — a `damage` / `admin_block` doesn't change the unit's state, so
  // the row can read "available" while the vehicle is actually held out of bookings.
  const blocksByUnit = new Map<string, string[]>();
  for (const b of blocks.data ?? []) {
    if (b.status === 'active')
      blocksByUnit.set(b.unitId, [...(blocksByUnit.get(b.unitId) ?? []), b.kind]);
  }

  const runBlock = async () => {
    if (!blockUnit) return;
    if (!blockReason) throw new Error('reason required'); // keeps the ConfirmDialog open
    setResult(null);
    try {
      await addBlock.mutateAsync({
        unitId: blockUnit.id,
        kind: blockKind,
        reasonCode: blockReason,
        startAt: new Date().toISOString(),
      });
      setResult({
        ok: true,
        text: t(
          blockKind === 'maintenance' ? 'ops.fleet.blockedMsg' : 'ops.fleet.blockedMsgOther',
          { plate: blockUnit.plate },
        ),
      });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.fleet.blockFail')) });
    } finally {
      setBlockUnit(null);
      setBlockReason('');
    }
  };
  const runTransfer = async () => {
    if (!xferUnit || !xferTo) return;
    setResult(null);
    try {
      const r = await transfer.mutateAsync({ unitId: xferUnit.id, toLocationCode: xferTo });
      setResult({
        ok: true,
        text: t('ops.fleet.transferredMsg', { plate: xferUnit.plate, to: r.currentLocationCode }),
      });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.fleet.transferFail')) });
    } finally {
      setXferUnit(null);
      setXferTo('');
    }
  };
  const runRelease = async () => {
    if (!releaseB) return;
    setResult(null);
    try {
      await releaseBlock.mutateAsync(releaseB.id);
      setResult({ ok: true, text: t('ops.fleet.releasedMsg', { plate: releaseB.plate }) });
    } catch (e) {
      setResult({ ok: false, text: errText(e, t('ops.fleet.releaseFail')) });
    } finally {
      setReleaseB(null);
    }
  };

  const columns: Array<DataTableColumn<OpsUnit>> = [
    {
      key: 'plate',
      header: t('ops.tbl.plate'),
      cell: (u) => u.plate,
      className: 'bidi-isolate font-mono text-xs',
    },
    {
      key: 'vin',
      header: t('ops.tbl.vin'),
      cell: (u) => u.vin,
      className: 'bidi-isolate font-mono text-xs',
    },
    {
      key: 'vehicle',
      header: t('ops.tbl.vehicle'),
      cell: (u) =>
        [u.year, u.make, u.model].filter(Boolean).join(' ') + (u.colour ? ` · ${u.colour}` : ''),
    },
    { key: 'category', header: t('ops.tbl.category'), cell: (u) => u.categoryName },
    { key: 'location', header: t('ops.tbl.location'), cell: (u) => u.currentLocationCode },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (u) => {
        const held = blocksByUnit.get(u.id) ?? [];
        return (
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={stateVariant(u.state)}>{unitStateLabel(t, u.state)}</Badge>
            {held.length ? (
              <Badge variant="warning" data-testid={`fleet-held-${u.id}`}>
                {t('ops.fleet.heldBadge', {
                  kind: [...new Set(held)].map((k) => blockKindLabel(t, k)).join(', '),
                })}
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-end',
            cell: (u: OpsUnit) => (
              <span className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.state === 'maintenance'}
                  onClick={() => {
                    setBlockUnit(u);
                    setBlockKind('maintenance');
                    setBlockReason('');
                  }}
                  data-testid={`fleet-block-${u.id}`}
                >
                  {t('ops.fleet.block')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.state === 'on_rent'}
                  onClick={() => {
                    setXferUnit(u);
                    setXferTo('');
                  }}
                  data-testid={`fleet-transfer-${u.id}`}
                >
                  {t('ops.fleet.transfer')}
                </Button>
              </span>
            ),
          } satisfies DataTableColumn<OpsUnit>,
        ]
      : []),
  ];

  const blockColumns: Array<DataTableColumn<FleetBlock>> = [
    {
      key: 'plate',
      header: t('ops.tbl.plate'),
      cell: (b) => b.plate,
      className: 'bidi-isolate font-mono text-xs',
    },
    { key: 'kind', header: t('ops.fin.kind'), cell: (b) => blockKindLabel(t, b.kind) },
    { key: 'reason', header: t('ops.fleet.reason'), cell: (b) => b.reasonCode ?? '—' },
    {
      key: 'since',
      header: t('ops.fleet.since'),
      cell: (b) => fmt.dateTime(b.startAt),
      className: 'text-xs text-muted-foreground',
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-end',
            cell: (b: FleetBlock) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReleaseB(b)}
                data-testid={`fleet-block-release-${b.id}`}
              >
                {t('ops.fleet.release')}
              </Button>
            ),
          } satisfies DataTableColumn<FleetBlock>,
        ]
      : []),
  ];

  const countLabel =
    units.data && units.data.count < units.data.total
      ? t('ops.fleet.showingOf', { shown: units.data.count, total: units.data.total })
      : units.data
        ? t('ops.fleet.unitCount', { n: units.data.total })
        : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.fleet.title')} description={t('ops.fleet.subtitle')} />

      {result ? (
        <Alert variant={result.ok ? 'success' : 'destructive'} data-testid="fleet-result">
          <AlertTitle>{result.ok ? t('state.success.title') : t('state.failure.title')}</AlertTitle>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t('ops.fleet.card')}</CardTitle>
            <p
              className="text-sm text-muted-foreground"
              aria-live="polite"
              data-testid="fleet-count"
            >
              {units.isLoading ? t('ops.st.loading') : (countLabel ?? '')}
            </p>
          </div>
          <Toolbar aria-label={t('ops.fleet.card')}>
            <select
              aria-label={t('ops.search.location')}
              className={selectClass}
              value={locationCode}
              onChange={(e) => setParam('location', e.target.value)}
            >
              <option value="">{t('ops.search.anyLocation')}</option>
              {(locations.data ?? []).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
            <select
              aria-label={t('ops.fleet.filterCat')}
              className={selectClass}
              value={categoryCode}
              onChange={(e) => setParam('category', e.target.value)}
            >
              <option value="">{t('ops.fleet.anyCategory')}</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <select
              aria-label={t('ops.fleet.filterState')}
              className={selectClass}
              value={stateFilter}
              onChange={(e) => setParam('state', e.target.value)}
            >
              <option value="">{t('ops.fleet.allStates')}</option>
              {UNIT_STATES.map((s) => (
                <option key={s} value={s}>
                  {unitStateLabel(t, s)}
                </option>
              ))}
            </select>
            {anyFilter ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setParams({}, { replace: true })}
                data-testid="fleet-clear"
              >
                {t('ops.rent.clearFilters')}
              </Button>
            ) : null}
          </Toolbar>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={units.data?.results}
            rowKey={(u) => u.id}
            isLoading={units.isLoading}
            isError={units.isError}
            onRetry={() => units.refetch()}
            rowProps={(u) => ({ 'data-plate': u.plate, 'data-state': u.state })}
            testid="fleet-table"
            bodyTestid="fleet-rows"
            minWidth={canManage ? '52rem' : '40rem'}
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fleet.loadFail'),
              retry: t('ops.st.retry'),
              empty: anyFilter ? t('ops.fleet.emptyFiltered') : t('ops.fleet.empty'),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.fleet.blocks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={blockColumns}
            rows={blocks.data}
            rowKey={(b) => b.id}
            isLoading={blocks.isLoading}
            isError={blocks.isError}
            onRetry={() => blocks.refetch()}
            rowProps={(b) => ({ 'data-unit': b.unitId })}
            testid="fleet-block-table"
            bodyTestid="fleet-block-rows"
            minWidth="36rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fleet.blocksLoadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.fleet.noBlocks'),
            }}
          />
        </CardContent>
      </Card>

      {canManage ? <ImportUnitsCard /> : null}

      <ConfirmDialog
        open={!!blockUnit}
        onOpenChange={(v) => !v && setBlockUnit(null)}
        destructive
        title={t('ops.fleet.blockTitle', { plate: blockUnit?.plate ?? '' })}
        description={
          <div className="space-y-3">
            <p>
              {blockKind === 'maintenance'
                ? t('ops.fleet.blockBodyMaintenance')
                : t('ops.fleet.blockBodyOther')}
            </p>
            {blockUnit && (blocksByUnit.get(blockUnit.id)?.length ?? 0) > 0 ? (
              <p className="text-sm text-warning">
                {t('ops.fleet.alreadyHeld', { n: blocksByUnit.get(blockUnit.id)!.length })}
              </p>
            ) : null}
            <Field label={t('ops.fin.kind')} htmlFor="fb-kind">
              {({ id }) => (
                <select
                  id={id}
                  className={selectClass}
                  value={blockKind}
                  onChange={(e) => setBlockKind(e.target.value as (typeof BLOCK_KINDS)[number])}
                >
                  {BLOCK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {blockKindLabel(t, k)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('ops.fleet.reason')} htmlFor="fb-reason" required>
              {({ id, describedBy, invalid }) => (
                <LookupSelect
                  typeCode="block_reason"
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={blockReason}
                  onChange={setBlockReason}
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.fleet.block')}
        confirmDisabled={!blockReason}
        onConfirm={runBlock}
      />

      <ConfirmDialog
        open={!!xferUnit}
        onOpenChange={(v) => !v && setXferUnit(null)}
        title={t('ops.fleet.transferTitle', { plate: xferUnit?.plate ?? '' })}
        description={
          <div className="space-y-3">
            <p>{t('ops.fleet.transferBody')}</p>
            <Field label={t('ops.fleet.transferTo')} htmlFor="xfer-to">
              {({ id }) => (
                <select
                  id={id}
                  className={selectClass}
                  value={xferTo}
                  onChange={(e) => setXferTo(e.target.value)}
                >
                  <option value="">{t('ops.fleet.transferPick')}</option>
                  {(locations.data ?? [])
                    .filter((l) => l.code !== xferUnit?.currentLocationCode)
                    .map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                </select>
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.fleet.transfer')}
        onConfirm={runTransfer}
      />

      <ConfirmDialog
        open={!!releaseB}
        onOpenChange={(v) => !v && setReleaseB(null)}
        title={t('ops.fleet.releaseTitle', { plate: releaseB?.plate ?? '' })}
        description={t('ops.fleet.releaseBody')}
        confirmLabel={t('ops.fleet.release')}
        onConfirm={runRelease}
      />
    </div>
  );
}

function ImportUnitsCard() {
  const { t } = useI18n();
  const importUnits = useImportUnits();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<UnitImportResult | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(commit: boolean) {
    setMsg(null);
    try {
      const r = await importUnits.mutateAsync({ csv, commit });
      setResult(r);
      if (r.committed) {
        setMsg({ ok: true, text: t('ops.fleet.importDone', { n: r.created }) });
        setCsv('');
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : t('ops.fleet.importFail') });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCsv(await file.text());
    e.target.value = '';
  }

  const errorColumns: Array<DataTableColumn<UnitImportResult['errors'][number]>> = [
    { key: 'row', header: t('ops.fleet.importRow'), cell: (r) => r.row, className: 'tabular-nums' },
    {
      key: 'field',
      header: t('ops.fleet.importField'),
      cell: (r) => r.field,
      className: 'font-mono text-xs',
    },
    { key: 'message', header: t('ops.fleet.importIssue'), cell: (r) => r.message },
  ];

  const clean = result && result.errors.length === 0 && result.valid > 0 && !result.committed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('ops.fleet.import')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('ops.fleet.importHint')}</p>
        <code className="bidi-isolate block overflow-x-auto whitespace-pre rounded bg-muted px-2 py-1 text-xs">
          {IMPORT_HEADER}
        </code>
        <Textarea
          rows={5}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={IMPORT_HEADER}
          aria-label={t('ops.fleet.import')}
          data-testid="fleet-import-csv"
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            aria-label={t('ops.fleet.importFile')}
            className="max-w-full text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!csv.trim()}
            loading={importUnits.isPending}
            onClick={() => run(false)}
            data-testid="fleet-import-validate"
          >
            {t('ops.fleet.importValidate')}
          </Button>
          <Button
            size="sm"
            disabled={!clean}
            loading={importUnits.isPending}
            onClick={() => run(true)}
            data-testid="fleet-import-commit"
          >
            {result
              ? t('ops.fleet.importCommit', { n: result.valid })
              : t('ops.fleet.importCommitEmpty')}
          </Button>
        </div>

        {msg ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              msg.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10'
            }`}
            data-testid="fleet-import-msg"
          >
            {msg.text}
          </p>
        ) : null}

        {result && !result.committed ? (
          <div className="space-y-2" data-testid="fleet-import-result">
            <p className="text-sm">
              {t('ops.fleet.importSummary', {
                total: result.total,
                valid: result.valid,
                errors: result.errors.length,
              })}
            </p>
            {result.errors.length ? (
              <DataTable
                columns={errorColumns}
                rows={result.errors}
                rowKey={(_r, i) => String(i)}
                testid="fleet-import-errors"
                minWidth="28rem"
                labels={{
                  loading: t('ops.st.loading'),
                  loadFailTitle: t('ops.fleet.importFail'),
                  retry: t('ops.st.retry'),
                  empty: t('ops.fleet.importClean'),
                }}
              />
            ) : (
              <p className="text-sm text-success">{t('ops.fleet.importClean')}</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
