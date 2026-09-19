import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { checkField, FIELD_MAX, previewSentences, type PolicyKey } from './policy-model';

import { TextareaField, TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfigPreview, useDraftConfigVersion, type PolicyPreview } from '@/lib/admin-hooks';

type Values = Record<string, string> & { note: string };

/**
 * Propose a change to one policy setting: enter the new values, preview what they mean in money
 * and hours, and save a draft revision. A different reviewer approves it before it applies.
 */
export function PolicySheet({
  kind,
  setting,
  initial,
  current,
  open,
  onOpenChange,
}: {
  kind: string;
  setting: PolicyKey;
  /** starting values (a revision being revised, or blank) */
  initial: Record<string, string>;
  /** currently published values, shown as placeholders */
  current: Record<string, number> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const draft = useDraftConfigVersion();
  const preview = useConfigPreview();

  const schema = useMemo(
    () =>
      z
        .object({ note: z.string() })
        .passthrough()
        .superRefine((v, ctx) => {
          for (const f of setting.fields) {
            const problem = checkField(f, String((v as Record<string, unknown>)[f] ?? ''));
            if (!problem) continue;
            ctx.addIssue({
              code: 'custom',
              path: [f],
              message:
                problem === 'required'
                  ? t('error.field.required')
                  : problem === 'range'
                    ? t('ops.cfg.rangeInvalid', { max: FIELD_MAX[f] ?? 0 })
                    : t('ops.cfg.wholeInvalid'),
            });
          }
        }),
    [t, setting],
  );
  const defaults = { ...initial, note: '' } as Values;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  const payloadOf = (v: Values) =>
    Object.fromEntries(setting.fields.map((f) => [f, Number(v[f])])) as Record<string, number>;
  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });
  const sentence = (pp: PolicyPreview, id: 'cancelFee' | 'cancelFree' | 'fuel') =>
    id === 'cancelFee'
      ? t('ops.cfg.pv.cancelFee', {
          hours: fmt.number(pp.freeCancelHours),
          pct: fmt.percent(pp.lateFeeBps / 10000, { maximumFractionDigits: 2 }),
          fee: money(pp.lateFeeMinor, pp.currency),
          sample: money(pp.sampleTotalMinor, pp.currency),
        })
      : id === 'cancelFree'
        ? t('ops.cfg.pv.cancelFree', { hours: fmt.number(pp.freeCancelHours) })
        : t('ops.cfg.pv.fuel', {
            pct: fmt.number(pp.sampleFuelDeficitPct),
            charge: money(pp.fuelChargeMinor, pp.currency),
          });

  async function runPreview() {
    if (!(await form.trigger(setting.fields))) return;
    preview.mutate({ kind, key: setting.key, payload: payloadOf(form.getValues()) });
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.cfg.newFor', { setting: t(`ops.cfg.key.${setting.key}`) })}
      description={t('ops.cfg.newForHint')}
      submitLabel={t('ops.cfg.saveDraft')}
      onSubmit={async (v) => {
        const created = await draft.mutateAsync({
          kind,
          key: setting.key,
          payload: payloadOf(v),
          note: v.note.trim() || undefined,
        });
        toast.success(t('ops.cfg.drafted', { n: created.revision }));
      }}
    >
      {setting.fields.map((f, i) => (
        <TextField
          key={f}
          control={form.control}
          name={f}
          label={t(`ops.cfg.field.${f}`)}
          description={t(`ops.cfg.field.${f}Hint`)}
          inputMode="numeric"
          normalize={(v) => v.replace(/\D/g, '')}
          placeholder={current ? String(current[f] ?? '') : ''}
          autoFocus={i === 0}
          data-testid={`cfg-${f}`}
        />
      ))}
      <TextareaField
        control={form.control}
        name="note"
        label={t('ops.cfg.note')}
        description={t('ops.cfg.noteHint')}
        rows={2}
      />

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('ops.cfg.previewOut')}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={preview.isPending}
            onClick={() => void runPreview()}
            data-testid="config-preview"
          >
            <Eye aria-hidden="true" />
            {t('ops.cfg.preview')}
          </Button>
        </div>
        {preview.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('ops.cfg.previewFail')}</AlertDescription>
          </Alert>
        ) : preview.data ? (
          <ul
            className="list-disc space-y-1 ps-5 text-sm text-muted-foreground"
            data-testid="config-preview-output"
          >
            {(preview.data.policy
              ? previewSentences(preview.data.policy).map((id) =>
                  sentence(preview.data!.policy!, id),
                )
              : preview.data.examples
            ).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t('ops.cfg.previewHint')}</p>
        )}
      </div>
    </FormSheet>
  );
}
