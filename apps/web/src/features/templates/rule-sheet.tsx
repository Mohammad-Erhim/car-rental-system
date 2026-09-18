import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { CheckField, SelectField, TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUpsertNotificationRule, type NotificationRule } from '@/lib/admin-hooks';

const AUDIENCES = ['primary_renter', 'account_holder', 'all_drivers', 'ops'] as const;

interface Values {
  enabled: boolean;
  audience: (typeof AUDIENCES)[number];
  senderIdentity: string;
  delayMinutes: string;
  quietStart: string;
  quietEnd: string;
  maxAttempts: string;
  retryBackoffMinutes: string;
  escalateAfterAttempts: string;
}

const whole = (min: number, max: number, message: string) =>
  z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, { message });

/**
 * The delivery policy of one (event, channel): whether it is sent, to whom, when, how often it is
 * retried and who sends it. Audience, timing, retry and escalation are stored for a scheduler; the
 * enable switch and sender identity apply on send today.
 */
export function RuleSheet({
  rule,
  event,
  channel,
  open,
  onOpenChange,
}: {
  rule: NotificationRule;
  event: string;
  channel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const save = useUpsertNotificationRule();

  const schema = useMemo(
    () =>
      z
        .object({
          enabled: z.boolean(),
          audience: z.enum(AUDIENCES),
          senderIdentity: z
            .string()
            .max(60)
            .refine((v) => v === '' || /^[A-Za-z0-9._-]+$/.test(v), {
              message: t('ops.rule.senderInvalid'),
            }),
          delayMinutes: whole(0, 100_000, t('ops.rule.rangeInvalid', { min: 0, max: 100000 })),
          quietStart: z.string(),
          quietEnd: z.string(),
          maxAttempts: whole(1, 20, t('ops.rule.rangeInvalid', { min: 1, max: 20 })),
          retryBackoffMinutes: whole(0, 10_080, t('ops.rule.rangeInvalid', { min: 0, max: 10080 })),
          escalateAfterAttempts: z
            .string()
            .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 20), {
              message: t('ops.rule.rangeInvalid', { min: 1, max: 20 }),
            }),
        })
        .superRefine((v, ctx) => {
          if (!!v.quietStart !== !!v.quietEnd) {
            ctx.addIssue({
              code: 'custom',
              path: [v.quietStart ? 'quietEnd' : 'quietStart'],
              message: t('ops.rule.quietBoth'),
            });
          }
        }),
    [t],
  );
  const defaults: Values = {
    enabled: rule.enabled,
    audience: rule.audience,
    senderIdentity: rule.senderIdentity ?? '',
    delayMinutes: String(rule.delayMinutes),
    quietStart: rule.quietHours?.start ?? '',
    quietEnd: rule.quietHours?.end ?? '',
    maxAttempts: String(rule.maxAttempts),
    retryBackoffMinutes: String(rule.retryBackoffMinutes),
    escalateAfterAttempts:
      rule.escalateAfterAttempts == null ? '' : String(rule.escalateAfterAttempts),
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const digits = (v: string) => v.replace(/\D/g, '');

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.rule.title')}
      description={
        <span className="bidi-isolate font-mono text-xs">
          {event} · {channel}
        </span>
      }
      submitLabel={t('ops.rule.save')}
      onSubmit={async (v) => {
        await save.mutateAsync({
          event,
          channel,
          enabled: v.enabled,
          audience: v.audience,
          delayMinutes: Number(v.delayMinutes),
          quietHours: v.quietStart && v.quietEnd ? { start: v.quietStart, end: v.quietEnd } : null,
          maxAttempts: Number(v.maxAttempts),
          retryBackoffMinutes: Number(v.retryBackoffMinutes),
          escalateAfterAttempts: v.escalateAfterAttempts ? Number(v.escalateAfterAttempts) : null,
          senderIdentity: v.senderIdentity.trim() || null,
        });
        toast.success(t('ops.rule.saved'));
      }}
    >
      <Alert variant="info">
        <AlertDescription>{t('ops.rule.notEnforcedNotice')}</AlertDescription>
      </Alert>
      <CheckField
        control={form.control}
        name="enabled"
        label={t('ops.rule.enabled')}
        description={t('ops.rule.enabledHint')}
        variant="switch"
        testId="rule-toggle"
      />
      <FormSection title={t('ops.rule.secWho')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="audience"
            label={t('ops.rule.audience')}
            description={t('ops.rule.audienceHint')}
            options={AUDIENCES.map((a) => ({ value: a, label: t(`ops.rule.aud.${a}`) }))}
            testId="rule-audience"
          />
          <TextField
            control={form.control}
            name="senderIdentity"
            label={t('ops.rule.sender')}
            description={t('ops.rule.senderHint')}
            maxLength={60}
            data-testid="rule-sender"
          />
        </div>
      </FormSection>
      <FormSection title={t('ops.rule.secWhen')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            control={form.control}
            name="delayMinutes"
            label={t('ops.rule.delay')}
            description={t('ops.rule.delayHint')}
            inputMode="numeric"
            normalize={digits}
          />
          <TextField
            control={form.control}
            name="quietStart"
            label={t('ops.rule.quietStart')}
            description={t('ops.rule.quietStartHint')}
            type="time"
          />
          <TextField
            control={form.control}
            name="quietEnd"
            label={t('ops.rule.quietEnd')}
            description={t('ops.rule.quietEndHint')}
            type="time"
          />
        </div>
      </FormSection>
      <FormSection title={t('ops.rule.secRetry')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            control={form.control}
            name="maxAttempts"
            label={t('ops.rule.maxAttempts')}
            description={t('ops.rule.maxAttemptsHint')}
            inputMode="numeric"
            normalize={digits}
          />
          <TextField
            control={form.control}
            name="retryBackoffMinutes"
            label={t('ops.rule.backoff')}
            description={t('ops.rule.backoffHint')}
            inputMode="numeric"
            normalize={digits}
          />
          <TextField
            control={form.control}
            name="escalateAfterAttempts"
            label={t('ops.rule.escalate')}
            description={t('ops.rule.escalateHint')}
            inputMode="numeric"
            normalize={digits}
          />
        </div>
      </FormSection>
    </FormSheet>
  );
}
