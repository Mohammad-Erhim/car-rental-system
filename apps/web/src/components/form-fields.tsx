import { useI18n } from '@carrental/i18n/react';
import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { ChoiceTabs, type ChoiceOption } from '@/components/choice-tabs';
import { LookupSelect } from '@/components/lookup-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Labelled react-hook-form fields with the label / description / error wiring already done, so a
 * form reads as a list of fields instead of a wall of `FormField` render props.
 */
interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: ReactNode;
  className?: string;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  normalize,
  ...input
}: BaseProps<T> &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'defaultValue' | 'value'> & {
    /** rewrites what the user types before it is stored (e.g. lower-casing a code) */
    normalize?: (value: string) => string;
  }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...input}
              {...field}
              value={field.value ?? ''}
              onChange={(e) =>
                field.onChange(normalize ? normalize(e.target.value) : e.target.value)
              }
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  rows = 3,
  ...textarea
}: BaseProps<T> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'defaultValue' | 'value'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea rows={rows} {...textarea} {...field} value={field.value ?? ''} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Radix Select can't hold an empty value — this stands for "no selection". */
const NONE = '__none__';

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
  noneLabel,
  testId,
}: BaseProps<T> & {
  options: Array<{ value: string; label: string }>;
  /** adds a leading option that maps to the empty string */
  noneLabel?: string;
  testId?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value || (noneLabel ? NONE : '')}
            onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
          >
            <FormControl>
              <SelectTrigger data-testid={testId}>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {noneLabel ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Picks one value as a row of tabs (or a list of described options) — the form's replacement for a dropdown. */
export function ChoiceField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
  layout,
  testIdPrefix,
}: BaseProps<T> & {
  options: ChoiceOption[];
  layout?: 'pills' | 'list';
  testIdPrefix?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <ChoiceTabs
            value={field.value ?? ''}
            onChange={field.onChange}
            options={options}
            label={label}
            layout={layout}
            testIdPrefix={testIdPrefix}
          />
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** A single yes/no in a bordered row: the label and its explanation on the start, the box on the end. */
export function CheckField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  variant = 'checkbox',
  testId,
}: BaseProps<T> & { variant?: 'checkbox' | 'switch'; testId?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            'flex items-center justify-between gap-4 space-y-0 rounded-lg border p-4',
            className,
          )}
        >
          <div className="min-w-0 space-y-1 leading-none">
            <FormLabel className="cursor-pointer">{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
          </div>
          <FormControl>
            {variant === 'switch' ? (
              <Switch
                checked={!!field.value}
                onCheckedChange={field.onChange}
                data-testid={testId}
              />
            ) : (
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                data-testid={testId}
              />
            )}
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/**
 * Pick any number of codes from a list (a scope, a set of supported items). `emptyLabel` says what
 * an empty selection means, since "none" often stands for "all".
 */
export function CheckboxGroupField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
  emptyLabel,
  disabledValues,
  disabledHint,
  testId,
}: BaseProps<T> & {
  options: Array<{ value: string; label: string }>;
  emptyLabel?: string;
  /** options that can't be toggled (shown dimmed, with `disabledHint` as a tooltip) */
  disabledValues?: string[];
  disabledHint?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value: string[] = field.value ?? [];
        return (
          <FormItem className={className} data-testid={testId}>
            <FormLabel>{label}</FormLabel>
            <FormDescription>
              {value.length ? t('ops.prod.scopeSome', { n: value.length }) : (emptyLabel ?? '')}
              {description ? ` ${description}` : ''}
            </FormDescription>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const checked = value.includes(o.value);
                const locked = disabledValues?.includes(o.value) ?? false;
                return (
                  <label
                    key={o.value}
                    title={locked ? disabledHint : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border p-2.5 text-sm font-normal',
                      locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v === true ? [...value, o.value] : value.filter((c) => c !== o.value),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </label>
                );
              })}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

/** A reference-data select (currency, reason …) wired to the form. */
export function LookupField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  typeCode,
}: BaseProps<T> & { typeCode: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <LookupSelect typeCode={typeCode} value={field.value ?? ''} onChange={field.onChange} />
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
