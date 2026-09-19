import { useI18n } from '@carrental/i18n/react';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export type ScopeMode = 'all' | 'specific';

export interface ScopeOption {
  value: string;
  label: string;
  /** an archived branch that is already part of the scope: shown so it can be removed */
  archived?: boolean;
}

/** `[]` and "all locations" are the same thing to the API — the form keeps the choice explicit. */
export const scopeModeOf = (codes: readonly string[]): ScopeMode =>
  codes.length ? 'specific' : 'all';

/** Zod refinement shared by every form that uses this field. */
export const scopeIssue = (mode: ScopeMode, codes: readonly string[]): boolean =>
  mode === 'specific' && codes.length === 0;

/**
 * "Where does this apply?" — an explicit choice between every location and a chosen few, instead of
 * an empty checklist silently meaning "everything" (fail-open). A person limited to specific
 * locations cannot choose "all locations" (`restricted`): they may only grant, or manage, what is
 * inside their own scope.
 */
export function LocationScopeField<T extends FieldValues>({
  control,
  name,
  modeName,
  label,
  options,
  restricted,
  allLabel,
  allHint,
  specificLabel,
  specificHint,
  testId,
}: {
  control: Control<T>;
  /** the `string[]` of location codes */
  name: FieldPath<T>;
  /** the `'all' | 'specific'` companion field */
  modeName: FieldPath<T>;
  label: string;
  options: ScopeOption[];
  restricted: boolean;
  allLabel: string;
  allHint: string;
  specificLabel: string;
  specificHint?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const mode = useController({ control, name: modeName });
  const current: ScopeMode = restricted ? 'specific' : (mode.field.value as ScopeMode);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value: string[] = field.value ?? [];
        return (
          <FormItem data-testid={testId}>
            {/* the section title above already names this field; keep the label for screen readers */}
            <FormLabel className="sr-only">{label}</FormLabel>
            <RadioGroup
              value={current}
              onValueChange={(v) => {
                mode.field.onChange(v);
                if (v === 'all') field.onChange([]);
              }}
              aria-label={label}
            >
              <label
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 text-sm font-normal',
                  restricted ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                )}
              >
                <RadioGroupItem value="all" disabled={restricted} className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block font-medium">{allLabel}</span>
                  <span className="block text-muted-foreground">
                    {restricted ? t('ops.scope.allDisabled') : allHint}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm font-normal">
                <RadioGroupItem value="specific" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block font-medium">{specificLabel}</span>
                  {specificHint ? (
                    <span className="block text-muted-foreground">{specificHint}</span>
                  ) : null}
                </span>
              </label>
            </RadioGroup>
            {current === 'specific' ? (
              <div className="space-y-2 ps-1">
                <FormDescription>{t('ops.prod.scopeSome', { n: value.length })}</FormDescription>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((o) => (
                    <label
                      key={o.value}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm font-normal"
                    >
                      <Checkbox
                        checked={value.includes(o.value)}
                        onCheckedChange={(v) =>
                          field.onChange(
                            v === true ? [...value, o.value] : value.filter((c) => c !== o.value),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.archived ? (
                        <span className="text-xs text-muted-foreground">
                          {t('ops.locFilter.archivedTag')}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
