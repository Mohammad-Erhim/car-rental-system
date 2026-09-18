import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { CheckField, TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { SecretField } from '@/components/secret-field';
import { useUpdateEmailConfig, type EmailConfigSummary } from '@/lib/admin-hooks';

interface Values {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  activate: boolean;
}

/**
 * The SMTP connection and sender. The password is write-only (the API returns only whether one is
 * saved and its last four), so an untouched saved password is not re-sent. "Use it now" also makes
 * SMTP the active driver in the same save.
 */
export function SmtpSheet({
  config,
  open,
  onOpenChange,
}: {
  config: EmailConfigSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const update = useUpdateEmailConfig();
  const s = config.smtp;

  const schema = useMemo(
    () =>
      z.object({
        host: z.string().trim().min(1, t('error.field.required')),
        port: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535, {
          message: t('ops.email.portInvalid'),
        }),
        secure: z.boolean(),
        username: z.string(),
        password: z.string(),
        fromAddress: z.string().trim().email(t('ops.loc.emailInvalid')),
        fromName: z.string(),
        activate: z.boolean(),
      }),
    [t],
  );
  const defaults: Values = {
    host: s.host ?? '',
    port: s.port ? String(s.port) : '587',
    secure: s.secure,
    username: s.username ?? '',
    password: '',
    fromAddress: s.fromAddress ?? '',
    fromName: s.fromName ?? '',
    activate: config.activeDriver === 'smtp',
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.email.smtpSection')}
      description={t('ops.email.smtpSectionHint')}
      submitLabel={t('ops.email.save')}
      onSubmit={async (v) => {
        await update.mutateAsync({
          activeDriver: v.activate ? 'smtp' : undefined,
          smtp: {
            host: v.host.trim(),
            port: Number(v.port),
            secure: v.secure,
            username: v.username.trim(),
            password: v.password || undefined,
            fromAddress: v.fromAddress.trim(),
            fromName: v.fromName.trim(),
          },
        });
        toast.success(t(v.activate ? 'ops.email.switchedToSmtp' : 'ops.email.saved'));
      }}
    >
      <FormSection title={t('ops.email.secConnection')}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <TextField
            control={form.control}
            name="host"
            label={t('ops.email.host')}
            placeholder="smtp.example.com"
            autoComplete="off"
            autoFocus
            data-testid="email-host"
          />
          <TextField
            control={form.control}
            name="port"
            label={t('ops.email.port')}
            inputMode="numeric"
            normalize={(v) => v.replace(/\D/g, '')}
            data-testid="email-port"
          />
        </div>
        <CheckField
          control={form.control}
          name="secure"
          label={t('ops.email.secure')}
          variant="switch"
          testId="email-secure"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="username"
            label={t('ops.email.username')}
            autoComplete="off"
            data-testid="email-username"
          />
          <SecretField
            control={form.control}
            name="password"
            label={t('ops.email.password')}
            configured={s.configured}
            last4={s.passwordLast4}
            testId="email-password"
          />
        </div>
      </FormSection>
      <FormSection title={t('ops.email.secSender')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="fromAddress"
            label={t('ops.email.fromAddress')}
            type="email"
            placeholder="noreply@example.com"
            data-testid="email-from-address"
          />
          <TextField
            control={form.control}
            name="fromName"
            label={t('ops.email.fromName')}
            data-testid="email-from-name"
          />
        </div>
      </FormSection>
      <CheckField
        control={form.control}
        name="activate"
        label={t('ops.email.useNow')}
        description={t('ops.email.useNowHint')}
        testId="email-activate"
      />
    </FormSheet>
  );
}
