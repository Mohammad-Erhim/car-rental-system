'use client';

import { apiFetch } from '@carrental/client';
import { useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Alert, AlertDescription, Button, ErrorSummary, Field, Input } from '@carrental/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useLocale } from '../../../../lib/nav';

type StartResult = {
  challengeId: string | null;
  channel: string | null;
  message: string;
  devCode?: string;
};

/** SCREEN-CUS-010 — account recovery through a verified channel (FR-IAM-004). */
export default function RecoveryPage() {
  const { t } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<'start' | 'complete' | 'done'>('start');
  const [email, setEmail] = useState('');
  const [started, setStarted] = useState<StartResult | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const errs = useFormErrors({
    email: t('auth.email'),
    code: t('auth.recoveryCode'),
    newPassword: t('auth.newPassword'),
  });

  async function start(e: FormEvent) {
    e.preventDefault();
    errs.clear();
    setBusy(true);
    try {
      const res = await apiFetch<StartResult>('/auth/recovery/start', {
        method: 'POST',
        anonymous: true,
        body: { email, audience: 'customer' },
      });
      setStarted(res);
      setStep('complete');
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    if (!started?.challengeId) {
      setStep('done');
      return;
    }
    errs.clear();
    setBusy(true);
    try {
      await apiFetch('/auth/recovery/complete', {
        method: 'POST',
        anonymous: true,
        body: { challengeId: started.challengeId, code, newPassword },
      });
      setStep('done');
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('auth.recoverTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('site.auth.recoverySub')}</p>
      </div>
      <div className="space-y-4">
        <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
        {errs.topLevelMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errs.topLevelMessage}</AlertDescription>
          </Alert>
        ) : null}

        {step === 'start' ? (
          <form onSubmit={start} className="space-y-4" noValidate>
            <Field
              label={t('auth.accountEmail')}
              htmlFor="field-email"
              required
              error={errs.fieldError('email')}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={busy}>
              {t('auth.sendInstructions')}
            </Button>
          </form>
        ) : step === 'complete' ? (
          <form onSubmit={complete} className="space-y-4" noValidate>
            <Alert variant="info">
              <AlertDescription>{started?.message}</AlertDescription>
            </Alert>
            {started?.devCode ? (
              <Alert variant="info">
                <AlertDescription>
                  {t('auth.devCodeLabel')}{' '}
                  <span className="bidi-isolate font-mono">{started.devCode}</span>
                </AlertDescription>
              </Alert>
            ) : null}
            <Field
              label={t('auth.recoveryCode')}
              htmlFor="field-code"
              required
              error={errs.fieldError('code')}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              )}
            </Field>
            <Field
              label={t('auth.newPassword')}
              htmlFor="field-newPassword"
              required
              hint={t('auth.newPasswordHint')}
              error={errs.fieldError('newPassword')}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={busy}>
              {t('action.save')}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 text-sm">
            <Alert variant="success">
              <AlertDescription>{t('auth.resetDone')}</AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => router.push(`/${locale}/sign-in`)}>
              {t('action.signIn')}
            </Button>
          </div>
        )}

        <p className="text-center text-sm">
          <Link
            href={`/${locale}/sign-in`}
            className="font-medium text-brand hover:underline underline-offset-4"
          >
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
