import { useI18n } from '@carrental/i18n/react';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { emptyRule, fromJsonLogic, OPERATORS, toJsonLogic, type RuleForm } from './rule';

import { ChoiceTabs } from '@/components/choice-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Edits the rule of a branch: comparisons on the request's variables joined by "all of" / "any of".
 * A rule the form cannot express (it was imported, or written by hand) is shown as read-only JSON
 * with a way to start over, instead of being silently rewritten.
 */
export function RuleBuilder({
  value,
  onChange,
  variables,
  label,
}: {
  value: Record<string, unknown>;
  onChange: (rule: Record<string, unknown>) => void;
  variables: string[];
  label: string;
}) {
  const { t } = useI18n();
  const parsed = fromJsonLogic(value);
  // keep half-typed rows (no variable yet) in the form even though they are not part of the rule
  const [form, setForm] = useState<RuleForm>(() =>
    parsed
      ? // a new (empty) rule starts on the first variable, so the tabs never show "nothing chosen"
        {
          ...parsed,
          rows: parsed.rows.map((r) => (r.variable ? r : { ...r, variable: variables[0] ?? '' })),
        }
      : emptyRule(variables[0] ?? ''),
  );
  const [custom, setCustom] = useState(parsed === null);

  const apply = (next: RuleForm) => {
    setForm(next);
    onChange(toJsonLogic(next));
  };
  const setRow = (i: number, patch: Partial<RuleForm['rows'][number]>) =>
    apply({ ...form, rows: form.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  if (custom) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="rule-custom">
        <p className="text-sm font-medium">{label}</p>
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs" dir="ltr">
          {JSON.stringify(value, null, 2)}
        </pre>
        <p className="text-xs text-muted-foreground">{t('ops.wfb.ruleCustom')}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const fresh = emptyRule(variables[0] ?? '');
            setCustom(false);
            apply(fresh);
          }}
        >
          {t('ops.wfb.ruleStartOver')}
        </Button>
      </div>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-lg border p-3" data-testid="rule-builder">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {form.rows.length > 1 ? (
        <ChoiceTabs
          value={form.combinator}
          onChange={(v) => apply({ ...form, combinator: v as 'and' | 'or' })}
          label={t('ops.wfb.combinator')}
          options={[
            { value: 'and', label: t('ops.wfb.matchAll') },
            { value: 'or', label: t('ops.wfb.matchAny') },
          ]}
        />
      ) : null}
      {form.rows.map((row, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md bg-muted/40 p-2.5"
          data-testid={`rule-row-${i}`}
        >
          <ChoiceTabs
            value={row.variable}
            onChange={(v) => setRow(i, { variable: v })}
            label={t('ops.wfb.variable')}
            options={variables.map((v) => ({
              value: v,
              label: <span className="bidi-isolate font-mono text-xs">{v}</span>,
            }))}
          />
          <ChoiceTabs
            value={row.op}
            onChange={(v) => setRow(i, { op: v as (typeof OPERATORS)[number] })}
            label={t('ops.wfb.operator')}
            options={OPERATORS.map((o) => ({ value: o, label: t(`ops.wfb.op.${o}`) }))}
          />
          <div className="flex items-center gap-2">
            <Input
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              placeholder={row.op === 'in' ? t('ops.wfb.valueList') : t('ops.wfb.value')}
              aria-label={t('ops.wfb.value')}
              dir="auto"
            />
            {form.rows.length > 1 ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('ops.wfb.removeRow')}
                onClick={() => apply({ ...form, rows: form.rows.filter((_, j) => j !== i) })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          apply({
            ...form,
            rows: [...form.rows, { variable: variables[0] ?? '', op: '==', value: '' }],
          })
        }
      >
        <Plus aria-hidden="true" />
        {t('ops.wfb.addCondition')}
      </Button>
    </fieldset>
  );
}
