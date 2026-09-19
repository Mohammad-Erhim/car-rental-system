import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/** Radix Select can't hold an empty value — this stands for "no filter". */
const ANY = '__any__';

export interface SelectOption {
  value: string;
  label: string;
}

/** One control in the panel. Values are plain strings keyed by `name` ('' = not filtering). */
export type FilterField =
  | {
      type: 'select';
      name: string;
      label: string;
      /** the entry shown for "no filter" (maps to '') */
      anyLabel: string;
      options: SelectOption[];
    }
  /** free text; `suggestions` become the browser's autocomplete list (any value is still accepted) */
  | {
      type: 'text';
      name: string;
      label: string;
      hint?: string;
      placeholder?: string;
      suggestions?: string[];
      mono?: boolean;
    }
  /** two date inputs bound to the values `from` and `to`; the end may not precede the start */
  | { type: 'dateRange'; fromLabel: string; toLabel: string };

export type FilterValues = Record<string, string>;

/**
 * The secondary filters of a list, kept out of the page so the page stays about one thing. The
 * page describes its filters as `fields`; values are edited locally and committed together with
 * "Apply", so the list doesn't refetch on every change inside the panel.
 */
export function FiltersSheet({
  open,
  onOpenChange,
  fields,
  values,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FilterField[];
  /** current values, one entry per field name (plus `from` / `to` for a date range) */
  values: FilterValues;
  onApply: (values: FilterValues) => void;
}) {
  const { t } = useI18n();
  const hasDates = fields.some((f) => f.type === 'dateRange');

  const schema = useMemo(
    () =>
      z.record(z.string()).refine((v) => !hasDates || !v.from || !v.to || v.to >= v.from, {
        path: ['to'],
        message: t('ops.search.dateOrder'),
      }),
    [t, hasDates],
  );

  const form = useForm<FilterValues>({ resolver: zodResolver(schema), defaultValues: values });

  // re-seed from the URL each time the panel opens (it may have changed via the chips)
  useEffect(() => {
    if (open) form.reset(values);
  }, [open, values, form]);

  const cleared = useMemo(() => {
    const out: FilterValues = {};
    for (const f of fields) {
      if (f.type === 'select' || f.type === 'text') out[f.name] = '';
      else {
        out.from = '';
        out.to = '';
      }
    }
    return out;
  }, [fields]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('action.close')} className="p-0 sm:max-w-md">
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit((v) => {
              onApply(v);
              onOpenChange(false);
            })}
            className="flex h-full min-h-0 flex-col"
          >
            <SheetHeader className="border-b p-6 pe-12">
              <SheetTitle>{t('ops.search.filtersTitle')}</SheetTitle>
              <SheetDescription>{t('ops.search.filtersDescTopBar')}</SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              {fields.map((f) =>
                f.type === 'select' ? (
                  <SelectFilter key={f.name} form={form} field={f} />
                ) : f.type === 'text' ? (
                  <TextFilter key={f.name} form={form} field={f} />
                ) : (
                  <div key="dates" className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="from"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{f.fromLabel}</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              max={form.watch('to') || undefined}
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="to"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{f.toLabel}</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              min={form.watch('from') || undefined}
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ),
              )}
            </div>

            <SheetFooter className="border-t p-6">
              <Button type="button" variant="outline" onClick={() => form.reset(cleared)}>
                {t('ops.search.reset')}
              </Button>
              <Button type="submit">{t('ops.search.apply')}</Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

function TextFilter({
  form,
  field: f,
}: {
  form: ReturnType<typeof useForm<FilterValues>>;
  field: Extract<FilterField, { type: 'text' }>;
}) {
  const listId = `filter-${f.name}-list`;
  return (
    <FormField
      control={form.control}
      name={f.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{f.label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ''}
              list={f.suggestions ? listId : undefined}
              placeholder={f.placeholder}
              autoComplete="off"
              className={f.mono ? 'font-mono' : undefined}
            />
          </FormControl>
          {f.suggestions ? (
            <datalist id={listId}>
              {f.suggestions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ) : null}
          {f.hint ? <FormDescription>{f.hint}</FormDescription> : null}
        </FormItem>
      )}
    />
  );
}

function SelectFilter({
  form,
  field: f,
}: {
  form: ReturnType<typeof useForm<FilterValues>>;
  field: Extract<FilterField, { type: 'select' }>;
}) {
  return (
    <FormField
      control={form.control}
      name={f.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{f.label}</FormLabel>
          <Select
            value={field.value || ANY}
            onValueChange={(v) => field.onChange(v === ANY ? '' : v)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={ANY}>{f.anyLabel}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  );
}

/** The recurring fields, built once so every list labels them identically. */
export function useFilterFields() {
  const { t } = useI18n();
  return useMemo(
    () => ({
      status: (codes: string[], label?: (code: string) => string): FilterField => ({
        type: 'select',
        name: 'status',
        label: t('ops.tbl.status'),
        anyLabel: t('ops.search.anyStatus'),
        options: codes.map((c) => ({ value: c, label: label ? label(c) : t(`ops.status.${c}`) })),
      }),
      dates: (labels?: { from: string; to: string }): FilterField => ({
        type: 'dateRange',
        fromLabel: labels?.from ?? t('ops.search.from'),
        toLabel: labels?.to ?? t('ops.search.to'),
      }),
    }),
    [t],
  );
}
