import { useI18n } from '@carrental/i18n/react';
import { AlertCircle, CheckCircle2, FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useImportUnits, type UnitImportResult } from '@/lib/ops-discovery-hooks';

const IMPORT_HEADER = 'plate,vin,categoryCode,locationCode,year,make,model,colour';

/**
 * Bulk-add vehicles from CSV. Two steps on purpose: "Validate" reports every row problem without
 * writing anything, and "Import" only unlocks once the file is clean.
 */
export function ImportUnitsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const importUnits = useImportUnits();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<UnitImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCsv('');
      setResult(null);
      setError(null);
    }
  }, [open]);

  async function run(commit: boolean) {
    setError(null);
    try {
      const r = await importUnits.mutateAsync({ csv, commit });
      setResult(r);
      if (r.committed) {
        toast.success(t('ops.fleet.importDone', { n: r.created }));
        onOpenChange(false);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('ops.fleet.importFail'));
    }
  }

  const clean = !!result && result.errors.length === 0 && result.valid > 0 && !result.committed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('action.close')}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 pe-12">
          <DialogTitle>{t('ops.fleet.import')}</DialogTitle>
          <DialogDescription>{t('ops.fleet.importHint')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <code className="bidi-isolate block overflow-x-auto whitespace-pre rounded-lg bg-muted px-3 py-2 text-xs">
            {IMPORT_HEADER}
          </code>
          <Textarea
            rows={7}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setResult(null);
            }}
            placeholder={IMPORT_HEADER}
            aria-label={t('ops.fleet.import')}
            data-testid="fleet-import-csv"
            className="font-mono text-xs"
          />
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setCsv(await file.text());
                  setResult(null);
                }
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <FileUp aria-hidden="true" />
              {t('ops.fleet.importFile')}
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive" data-testid="fleet-import-msg">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {result && !result.committed ? (
            <div className="space-y-3" data-testid="fleet-import-result">
              <Alert variant={result.errors.length ? 'warning' : 'success'}>
                {result.errors.length ? (
                  <AlertCircle aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                <AlertDescription>
                  {t('ops.fleet.importSummary', {
                    total: result.total,
                    valid: result.valid,
                    errors: result.errors.length,
                  })}
                  {result.errors.length === 0 ? ` — ${t('ops.fleet.importClean')}` : ''}
                </AlertDescription>
              </Alert>
              {result.errors.length ? (
                <div className="max-h-56 overflow-auto rounded-lg border">
                  <Table data-testid="fleet-import-errors">
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('ops.fleet.importRow')}</TableHead>
                        <TableHead>{t('ops.fleet.importField')}</TableHead>
                        <TableHead>{t('ops.fleet.importIssue')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="tabular-nums">{r.row}</TableCell>
                          <TableCell className="font-mono text-xs">{r.field}</TableCell>
                          <TableCell>{r.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!csv.trim()}
            loading={importUnits.isPending && !clean}
            onClick={() => void run(false)}
            data-testid="fleet-import-validate"
          >
            {t('ops.fleet.importValidate')}
          </Button>
          <Button
            type="button"
            disabled={!clean}
            loading={importUnits.isPending && clean}
            onClick={() => void run(true)}
            data-testid="fleet-import-commit"
          >
            {result
              ? t('ops.fleet.importCommit', { n: result.valid })
              : t('ops.fleet.importCommitEmpty')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
