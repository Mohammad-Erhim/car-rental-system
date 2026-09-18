import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { AuthCard } from './auth-card';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { PasswordInput } from '@/components/ui/password-input';
import { apiFetch } from '@/lib/api';
import { useServerFormErrors } from '@/lib/use-server-form-errors';

interface StartResult {
  challengeId: string | null;
  channel: string | null;
  message: string;
  devCode?: string;
}

type Step = 'start' | 'complete' | 'done';

/**
 * Account recovery through a verified channel (FR-IAM-004): request a code, then set a password.
 * Invited staff onboard through the same flow (the invite has no password yet — the invitee sets
 * their own), so `mode="activate"` only changes the copy.
 */
export function RecoveryPage({ mode = 'recovery' }: { mode?: 'recovery' | 'activate' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('start');
  const [started, setStarted] = useState<StartResult | null>(null);
  const [email, setEmail] = useState('');

  return (
    <AuthCard
      title={mode === 'activate' ? t('auth.activateTitle') : t('auth.recoverTitle')}
      subtitle={mode === 'activate' ? t('auth.activateSubtitle') : undefined}
      footer={
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      {step === 'start' ? (
        <StartForm
          mode={mode}
          onStarted={(res, addr) => {
            setStarted(res);
            setEmail(addr);
            setStep('complete');
          }}
        />
      ) : step === 'complete' ? (
        <CompleteForm email={email} started={started} onDone={() => setStep('done')} />
      ) : (
        <div className="space-y-5">
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>{t('auth.resetDone')}</AlertDescription>
          </Alert>
          <Button size="lg" className="w-full" onClick={() => navigate('/sign-in')}>
            {t('action.signIn')}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}

function StartForm({
  mode,
  onStarted,
}: {
  mode: 'recovery' | 'activate';
  onStarted: (res: StartResult, email: string) => void;
}) {
  const { t } = useI18n();
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t('error.field.required')).email(t('error.field.invalid')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const serverErrors = useServerFormErrors(form);

  async function onSubmit({ email }: Values) {
    serverErrors.clear();
    try {
      const res = await apiFetch<StartResult>('/auth/recovery/start', {
        method: 'POST',
        anonymous: true,
        body: { email, audience: 'staff' },
      });
      onStarted(res, email);
    } catch (err) {
      serverErrors.handle(err);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverErrors.formError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{serverErrors.formError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.accountEmail')}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {mode === 'activate' ? t('auth.sendCode') : t('auth.sendInstructions')}
        </Button>
      </form>
    </Form>
  );
}

function CompleteForm({
  started,
  onDone,
}: {
  email: string;
  started: StartResult | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const schema = useMemo(
    () =>
      z.object({
        code: z.string().min(1, t('error.field.required')),
        newPassword: z.string().min(10, t('error.field.tooShort')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', newPassword: '' },
  });
  const serverErrors = useServerFormErrors(form);

  async function onSubmit(values: Values) {
    // neutral path: no account matched — there is nothing to complete
    if (!started?.challengeId) {
      onDone();
      return;
    }
    serverErrors.clear();
    try {
      await apiFetch('/auth/recovery/complete', {
        method: 'POST',
        anonymous: true,
        body: { challengeId: started.challengeId, ...values },
      });
      onDone();
    } catch (err) {
      serverErrors.handle(err);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            {started?.message}
            {started?.devCode ? (
              <span className="mt-2 block">
                {t('auth.devCodeLabel')}{' '}
                <span className="bidi-isolate font-mono font-semibold">{started.devCode}</span>
              </span>
            ) : null}
          </AlertDescription>
        </Alert>

        {serverErrors.formError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{serverErrors.formError}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.recoveryCode')}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.newPassword')}</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  showLabel={t('auth.showPw')}
                  hideLabel={t('auth.hidePw')}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('auth.newPasswordHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {t('action.save')}
        </Button>
      </form>
    </Form>
  );
}
