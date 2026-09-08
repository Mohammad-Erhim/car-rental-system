import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Input,
  PageHeader,
  Textarea,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';

import { ApiError } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { useLocations } from '../../lib/discovery-hooks.js';
import {
  useAddFleetBlock,
  useFleetBlocks,
  useImportUnits,
  useOpsUnits,
  useReleaseFleetBlock,
  useTransferUnit,
  type FleetBlock,
  type UnitImportResult,
} from '../../lib/ops-discovery-hooks.js';

const IMPORT_HEADER = 'plate,vin,categoryCode,locationCode,year,make,model,colour';

type Unit = NonNullable<ReturnType<typeof useOpsUnits>['data']>[number];

/**
 * SCREEN-OPS-013 / 017 / 018 — Fleet inventory + operations. Units by location + category +
 * state (VIN / plate bidi-isolated); a `fleet.manage` holder can take a unit into maintenance
 * (which removes it from availability) and transfer it to another location.
 */
export function FleetInventoryPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fleet.manage');

  const [locationCode, setLocationCode] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const units = useOpsUnits({
    locationCode: locationCode || undefined,
    categoryCode: categoryCode || undefined,
  });
  const locations = useLocations();
  const blocks = useFleetBlocks('active');
  const addBlock = useAddFleetBlock();
  const releaseBlock = useReleaseFleetBlock();
  const transfer = useTransferUnit();
  const [msg, setMsg] = useState<string | null>(null);

  const stateVariant = (s: string) =>
    s === 'available'
      ? 'success'
      : s === 'maintenance' || s === 'out_of_service'
        ? 'warning'
        : 'neutral';

  async function doBlock(u: Unit) {
    const reason = window.prompt(t('ops.fleet.blockPrompt', { plate: u.plate }))?.trim();
    if (reason === undefined || reason === '') return;
    setMsg(null);
    try {
      await addBlock.mutateAsync({
        unitId: u.id,
        kind: 'maintenance',
        reasonCode: reason.slice(0, 60),
        startAt: new Date().toISOString(),
      });
      setMsg(t('ops.fleet.blockedMsg', { plate: u.plate }));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fleet.blockFail'));
    }
  }

  async function doTransfer(u: Unit) {
    const codes = (locations.data ?? [])
      .map((l) => l.code)
      .filter((c) => c !== u.currentLocationCode);
    const to = window
      .prompt(t('ops.fleet.transferPrompt', { plate: u.plate, options: codes.join(', ') }))
      ?.trim()
      .toUpperCase();
    if (!to) return;
    setMsg(null);
    try {
      const r = await transfer.mutateAsync({ unitId: u.id, toLocationCode: to });
      setMsg(t('ops.fleet.transferredMsg', { plate: u.plate, to: r.currentLocationCode }));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fleet.transferFail'));
    }
  }

  async function doRelease(b: FleetBlock) {
    setMsg(null);
    try {
      await releaseBlock.mutateAsync(b.id);
      setMsg(t('ops.fleet.releasedMsg', { plate: b.plate }));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fleet.releaseFail'));
    }
  }

  const columns: Array<DataTableColumn<Unit>> = [
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
      cell: (u) => <Badge variant={stateVariant(u.state)}>{u.state.replace('_', ' ')}</Badge>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-end',
            cell: (u: Unit) => (
              <span className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.state === 'maintenance'}
                  onClick={() => doBlock(u)}
                  data-testid={`fleet-block-${u.id}`}
                >
                  {t('ops.fleet.block')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.state === 'on_rent'}
                  onClick={() => doTransfer(u)}
                  data-testid={`fleet-transfer-${u.id}`}
                >
                  {t('ops.fleet.transfer')}
                </Button>
              </span>
            ),
          } satisfies DataTableColumn<Unit>,
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
    { key: 'kind', header: t('ops.fin.kind'), cell: (b) => b.kind, className: 'font-mono text-xs' },
    { key: 'reason', header: t('ops.fleet.reason'), cell: (b) => b.reasonCode ?? '—' },
    {
      key: 'since',
      header: t('ops.fleet.since'),
      cell: (b) => new Date(b.startAt).toLocaleString(),
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
                onClick={() => doRelease(b)}
                data-testid={`fleet-block-release-${b.id}`}
              >
                {t('ops.fleet.release')}
              </Button>
            ),
          } satisfies DataTableColumn<FleetBlock>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.fleet.title')} description={t('ops.fleet.subtitle')} />

      {msg ? (
        <p className="text-sm text-muted-foreground" data-testid="fleet-msg">
          {msg}
        </p>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.fleet.card')}</CardTitle>
          <Toolbar aria-label={t('ops.fleet.card')}>
            <Input
              placeholder={t('ops.fleet.filterLoc')}
              aria-label={t('ops.fleet.filterLoc')}
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              className="max-w-[14rem]"
            />
            <Input
              placeholder={t('ops.fleet.filterCat')}
              aria-label={t('ops.fleet.filterCat')}
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value.toLowerCase())}
              className="max-w-[14rem]"
            />
          </Toolbar>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={units.data}
            rowKey={(u) => u.id}
            isLoading={units.isLoading}
            isError={units.isError}
            onRetry={() => units.refetch()}
            rowProps={(u) => ({ 'data-plate': u.plate })}
            testid="fleet-table"
            bodyTestid="fleet-rows"
            minWidth={canManage ? '52rem' : '40rem'}
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fleet.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.fleet.empty'),
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
    </div>
  );
}

function ImportUnitsCard() {
  const { t } = useI18n();
  const importUnits = useImportUnits();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<UnitImportResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(commit: boolean) {
    setMsg(null);
    try {
      const r = await importUnits.mutateAsync({ csv, commit });
      setResult(r);
      if (r.committed) {
        setMsg(t('ops.fleet.importDone', { n: r.created }));
        setCsv('');
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('ops.fleet.importFail'));
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
        <p className="text-xs text-muted-foreground">
          {t('ops.fleet.importHint')} <code className="bidi-isolate">{IMPORT_HEADER}</code>
        </p>
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
            className="text-xs"
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
          <p className="text-sm text-muted-foreground" data-testid="fleet-import-msg">
            {msg}
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
