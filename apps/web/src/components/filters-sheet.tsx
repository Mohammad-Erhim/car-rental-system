import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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

export interface FilterValues {
  status: string;
  location: string;
  from: string;
  to: string;
}
type Values = FilterValues;

/**
 * The secondary filters of a list — status, location, date window — kept out of the page so the
 * page stays about one thing. Values are edited locally and committed together with "Apply", so
 * the list doesn't refetch on every change inside the panel. `statuses` are lifecycle codes
 * (labels come from `ops.status.*`); pass none to hide the status field.
 */
export function FiltersSheet({
  open,
  onOpenChange,
  values,
  statuses,
  locations,
  onApply,
  dateLabels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: Values;
  statuses: string[];
  locations: Array<{ code: string; name: string }>;
  onApply: (values: Values) => void;
  /** override the date-range labels (defaults to "Pickup from" / "Pickup until") */
  dateLabels?: { from: string; to: string };
}) {
  const { t } = useI18n();

  const schema = useMemo(
    () =>
      z
        .object({
          status: z.string(),
          location: z.string(),
          from: z.string(),
          to: z.string(),
        })
        .refine((v) => !v.from || !v.to || v.to >= v.from, {
          path: ['to'],
          message: t('ops.search.dateOrder'),
        }),
    [t],
  );

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: values });

  // re-seed from the URL each time the panel opens (it may have changed via the chips)
  useEffect(() => {
    if (open) form.reset(values);
  }, [open, values, form]);

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
              <SheetDescription>{t('ops.search.filtersDesc')}</SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              {statuses.length ? (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('ops.tbl.status')}</FormLabel>
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
                          <SelectItem value={ANY}>{t('ops.search.anyStatus')}</SelectItem>
                          {statuses.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`ops.status.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ops.search.location')}</FormLabel>
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
                        <SelectItem value={ANY}>{t('ops.search.anyLocation')}</SelectItem>
                        {locations.map((l) => (
                          <SelectItem key={l.code} value={l.code}>
                            {l.name} ({l.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{dateLabels?.from ?? t('ops.search.from')}</FormLabel>
                      <FormControl>
                        <Input type="date" max={form.watch('to') || undefined} {...field} />
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
                      <FormLabel>{dateLabels?.to ?? t('ops.search.to')}</FormLabel>
                      <FormControl>
                        <Input type="date" min={form.watch('from') || undefined} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <SheetFooter className="border-t p-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset({ status: '', location: '', from: '', to: '' })}
              >
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
