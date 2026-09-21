import { useAuth, useDebounced } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { SelectField, TextareaField, TextField } from '@/components/form-fields';
import { LookupSelect } from '@/components/lookup-select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  useCreateRestriction,
  useCustomerSearch,
  useMergeCustomer,
  usePrivacyRequestDecision,
  useRestrictionDecision,
  useUnmergeCustomer,
  type CustomerRecord,
  type CustomerRestriction,
  type PrivacyRequest,
} from '@/lib/admin-hooks';
import { cn } from '@/lib/utils';
import { usePendingApproval } from '@/lib/workflow-hooks';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCOPE_KINDS = ['all', 'category', 'location'] as const;
const CODE = /^[A-Za-z0-9_-]+$/;

/** Start an eligibility restriction. It stays pending until a manager approves it. */
export function AddRestrictionDialog({
  customerId,
  open,
  onOpenChange,
}: DialogProps & { customerId: string }) {
  const { t } = useI18n();
  const create = useCreateRestriction(customerId);
  const schema = useMemo(
    () =>
      z
        .object({
          category: z.string(),
          scopeKind: z.enum(SCOPE_KINDS),
          scopeValue: z.string().trim(),
          reasonCode: z.string().min(1, t('error.field.required')),
        })
        .superRefine((v, ctx) => {
          if (v.scopeKind !== 'all' && !CODE.test(v.scopeValue)) {
            ctx.addIssue({
              code: 'custom',
              path: ['scopeValue'],
              message: t('ops.cust.scopeValueHint'),
            });
          }
        }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { category: 'block', scopeKind: 'all', scopeValue: '', reasonCode: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const kind = form.watch('scopeKind');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.cust.rstrAdd')}
      description={t('ops.cust.rstrAddBody2')}
      submitLabel={t('ops.cust.rstrAdd')}
      onSubmit={async (v) => {
        await create.mutateAsync({
          category: v.category as 'review' | 'block',
          scope: v.scopeKind === 'all' ? 'all' : `${v.scopeKind}:${v.scopeValue}`,
          reasonCode: v.reasonCode,
        });
        toast.success(t('ops.cust.rstrCreated'));
      }}
    >
      <SelectField
        control={form.control}
        name="category"
        label={t('ops.cust.rstrCategory')}
        testId="rstr-category"
        options={[
          { value: 'block', label: t('ops.cust.rstrCatBlock') },
          { value: 'review', label: t('ops.cust.rstrCatReview') },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="scopeKind"
          label={t('ops.cust.scopeKind')}
          testId="rstr-scope-kind"
          options={[
            { value: 'all', label: t('ops.cust.scopeAll') },
            { value: 'category', label: t('ops.cust.scopeCategory') },
            { value: 'location', label: t('ops.cust.scopeLocation') },
          ]}
        />
        {kind !== 'all' ? (
          <TextField
            control={form.control}
            name="scopeValue"
            label={t('ops.cust.scopeValue')}
            placeholder={t('ops.cust.scopeValueHint')}
            data-testid="rstr-scope-value"
          />
        ) : null}
      </div>
      <FormField
        control={form.control}
        name="reasonCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.cust.rstrReason')}</FormLabel>
            <FormControl>
              <LookupSelect
                typeCode="restriction_reason"
                value={field.value}
                onChange={field.onChange}
                invalid={!!form.formState.errors.reasonCode}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormDialog>
  );
}

/** Approve, reject or lift a restriction — with an optional note kept on the audit trail. */
export function RestrictionDecisionDialog({
  customerId,
  action,
  restriction,
  open,
  onOpenChange,
}: DialogProps & {
  customerId: string;
  action: 'approve' | 'reject' | 'lift';
  restriction: CustomerRestriction;
}) {
  const { t } = useI18n();
  const decide = useRestrictionDecision(customerId);
  const defaults = { notes: '' };
  const form = useForm<typeof defaults>({ defaultValues: defaults });

  const copy = {
    approve: {
      title: t('ops.cust.approveTitle'),
      body: t('ops.cust.approveBody'),
      cta: t('ops.cust.rstrApprove'),
      done: t('ops.cust.rstrApproved'),
    },
    reject: {
      title: t('ops.cust.rejectTitle'),
      body: t('ops.cust.rejectBody'),
      cta: t('ops.cust.rstrReject'),
      done: t('ops.cust.rstrRejected'),
    },
    lift: {
      title: t('ops.cust.liftTitle'),
      body: t('ops.cust.liftBody'),
      cta: t('ops.cust.rstrLift'),
      done: t('ops.cust.rstrLifted'),
    },
  }[action];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive={action !== 'approve'}
      title={copy.title}
      description={copy.body}
      submitLabel={copy.cta}
      onSubmit={async ({ notes }) => {
        await decide.mutateAsync({ rid: restriction.id, action, notes: notes.trim() || undefined });
        toast.success(copy.done);
      }}
    >
      <TextareaField
        control={form.control}
        name="notes"
        label={t('ops.cust.decisionNotes')}
        data-testid="rstr-notes"
      />
    </FormDialog>
  );
}

/** Review, complete or reject a customer's access/correction/closure request (FR-IAM-008). */
export function PrivacyRequestDecisionDialog({
  customerId,
  action,
  request,
  open,
  onOpenChange,
}: DialogProps & {
  customerId: string;
  action: 'review' | 'complete' | 'reject';
  request: PrivacyRequest;
}) {
  const { t } = useI18n();
  const decide = usePrivacyRequestDecision(customerId);
  const defaults = { notes: '' };
  const form = useForm<typeof defaults>({ defaultValues: defaults });

  const copy = {
    review: {
      title: t('ops.cust.dreqReviewTitle'),
      body: t('ops.cust.dreqReviewBody'),
      cta: t('ops.cust.dreqReview'),
      done: t('ops.cust.dreqReviewed'),
    },
    complete: {
      title: t('ops.cust.dreqCompleteTitle'),
      body: t('ops.cust.dreqCompleteBody'),
      cta: t('ops.cust.dreqComplete'),
      done: t('ops.cust.dreqCompleted'),
    },
    reject: {
      title: t('ops.cust.dreqRejectTitle'),
      body: t('ops.cust.dreqRejectBody'),
      cta: t('ops.cust.dreqReject'),
      done: t('ops.cust.dreqRejected'),
    },
  }[action];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      destructive={action === 'reject'}
      title={copy.title}
      description={copy.body}
      submitLabel={copy.cta}
      onSubmit={async ({ notes }) => {
        await decide.mutateAsync({ rid: request.id, action, notes: notes.trim() || undefined });
        toast.success(copy.done);
      }}
    >
      <TextareaField
        control={form.control}
        name="notes"
        label={t('ops.cust.decisionNotes')}
        data-testid="dreq-notes"
      />
    </FormDialog>
  );
}

/**
 * Fold this record into another (reversible). The survivor is chosen by searching — never by
 * pasting an id — and shown back before you confirm.
 */
export function MergeDialog({
  record,
  open,
  onOpenChange,
}: DialogProps & { record: CustomerRecord }) {
  const { t } = useI18n();
  const pending = usePendingApproval();
  const merge = useMergeCustomer(record.id);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 350);
  const search = useCustomerSearch(debounced);
  const schema = useMemo(
    () =>
      z.object({
        intoId: z.string().min(1, t('ops.cust.mergePickRequired')),
        intoName: z.string(),
        reason: z.string(),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { intoId: '', intoName: '', reason: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const chosen = form.watch('intoId');
  const chosenName = form.watch('intoName');
  const candidates = (search.data?.results ?? []).filter(
    (c) => c.id !== record.id && c.status !== 'merged',
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
      form={form}
      defaultValues={defaults}
      destructive
      title={t('ops.cust.mergeTitle')}
      description={t('ops.cust.mergeBody', { name: record.fullName })}
      submitLabel={t('ops.cust.mergeSubmit')}
      onSubmit={async ({ intoId, reason }) => {
        const res = await merge.mutateAsync({ intoId, reason: reason.trim() || undefined });
        if (pending(res)) return;
        toast.success(t('ops.cust.mergeDone'));
      }}
    >
      <FormField
        control={form.control}
        name="intoId"
        render={() => (
          <FormItem>
            <FormLabel>{t('ops.cust.mergePick')}</FormLabel>
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('ops.cust.searchPlaceholder')}
                autoComplete="off"
                data-testid="cust-merge-into"
              />
              {search.isFetching && debounced.length >= 2 ? (
                <Loader2
                  className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            {chosen ? (
              <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm">
                {t('ops.cust.mergeKeeping', { name: chosenName })}
              </p>
            ) : null}
            {debounced.length >= 2 && candidates.length ? (
              <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        form.setValue('intoId', c.id, { shouldValidate: true });
                        form.setValue('intoName', c.fullName);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-accent',
                        chosen === c.id && 'bg-primary/5',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.fullName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.email ?? c.phone ?? '—'}
                        </span>
                      </span>
                      {chosen === c.id ? (
                        <Check className="size-4 text-primary" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : debounced.length >= 2 && search.data ? (
              <p className="text-xs text-muted-foreground">{t('ops.cust.noResults')}</p>
            ) : null}
            <FormMessage />
          </FormItem>
        )}
      />
      <TextField control={form.control} name="reason" label={t('ops.cust.mergeReason')} />
    </FormDialog>
  );
}

/** Undo the most recent merge. */
export function UnmergeDialog({
  record,
  open,
  onOpenChange,
}: DialogProps & { record: CustomerRecord }) {
  const { t } = useI18n();
  const unmerge = useUnmergeCustomer(record.id);
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={{}}
      destructive
      title={t('ops.cust.unmergeTitle')}
      description={t('ops.cust.unmergeBody')}
      submitLabel={t('ops.cust.undoMerge')}
      onSubmit={async () => {
        await unmerge.mutateAsync();
        toast.success(t('ops.cust.unmergeDone'));
      }}
    ></FormDialog>
  );
}

/** Whether the signed-in staff member may approve a restriction (any `customer.manage` holder — the author may). */
export function useCanDecide() {
  const { hasPermission } = useAuth();
  const manage = hasPermission('customer.manage');
  return {
    manage,
    canApprove: manage,
  };
}
