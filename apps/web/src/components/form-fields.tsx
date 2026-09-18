import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

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
import { Textarea } from '@/components/ui/textarea';

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
  ...input
}: BaseProps<T> &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'defaultValue' | 'value'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...input} {...field} value={field.value ?? ''} />
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
}: BaseProps<T> & { rows?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea rows={rows} {...field} value={field.value ?? ''} />
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
