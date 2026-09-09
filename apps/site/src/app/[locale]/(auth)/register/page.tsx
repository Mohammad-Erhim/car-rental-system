'use client';

import { apiFetch, takeReturnTo } from '@carrental/client';
import { useAuth, useFormErrors } from '@carrental/client/react';
import type { SessionResponse } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  ErrorSummary,
  Field,
  Input,
} from '@carrental/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useLocale } from '../../../../lib/nav';

type RegisterResult = {
  accountId: string;
  challengeId: string;
  channel: string;
  message: string;
  expiresAt: string;
  devCode?: string;
};

/** SCREEN-CUS-009 — register and verify contact; same-screen verification (design §8.1). */
export default function RegisterPage() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const { applySession } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, setPending] = useState<RegisterResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const errs = useFormErrors({
    fullName: t('auth.fullName'),
    email: t('auth.email'),
    password: t('auth.password'),
    acceptTerms: t('auth.register.acceptTerms'),
    code: t('auth.register.codeLabel'),
  });

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    errs.clear();
    setBusy(true);
    try {
      const res = await apiFetch<RegisterResult>('/auth/register', {
        method: 'POST',
        anonymous: true,
        body: {
          fullName,
          email,
          password,
          localeCode: uiLocale,
          acceptTerms: accept,
          marketingOptIn: marketing,
        },
      });
      setPending(res);
      setStep('verify');
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    errs.clear();
    setBusy(true);
    try {
      const session = await apiFetch<SessionResponse>('/auth/verify-contact', {
        method: 'POST',
        anonymous: true,
        body: { challengeId: pending.challengeId, code },
      });
      applySession(session);
      router.replace(takeReturnTo(`/${locale}/account`));
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await apiFetch<RegisterResult>('/auth/resend-verification', {
        method: 'POST',
        anonymous: true,
        body: { accountId: pending.accountId },
      });
      setPending({ ...pending, ...res });
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {step === 'form' ? t('action.register') : t('auth.register.verifyTitle')}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {step === 'form' ? t('site.auth.registerSub') : t('auth.register.codeSentTo', { email })}
        </p>
      </div>
      <div className="space-y-4">
        <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
        {errs.topLevelMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errs.topLevelMessage}</AlertDescription>
          </Alert>
        ) : null}

        {step === 'form' ? (
          <form onSubmit={submitForm} className="space-y-4" noValidate>
            <Field
              label={t('auth.fullName')}
              htmlFor="field-fullName"
              required
              error={errs.fieldError('fullName')}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field
              label={t('auth.email')}
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
            <Field
              label={t('auth.password')}
              htmlFor="field-password"
              required
              hint={t('auth.register.passwordHint')}
              error={errs.fieldError('password')}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                id="field-acceptTerms"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
              />
              <span>
                {t('auth.register.acceptTerms')}{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>
                {t('auth.register.marketingOptIn')} ({t('field.optional')})
              </span>
            </label>

            <Button
              type="submit"
              className="w-full"
              loading={busy}
              loadingLabel={t('auth.register.creating')}
            >
              {t('action.register')}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              {t('auth.register.codeSentTo', { email })}
            </p>
            {pending?.devCode ? (
              <Alert variant="info">
                <AlertDescription>
                  {t('auth.devCodeLabel')}{' '}
                  <span className="bidi-isolate font-mono">{pending.devCode}</span>
                </AlertDescription>
              </Alert>
            ) : null}
            <Field
              label={t('auth.register.codeLabel')}
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
            <Button
              type="submit"
              className="w-full"
              loading={busy}
              loadingLabel={t('auth.register.verifying')}
            >
              {t('action.confirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={resend}
              disabled={busy}
            >
              {t('auth.register.resend')}
            </Button>
          </form>
        )}

        {step === 'form' ? (
          <p className="text-center text-sm text-ink-muted">
            {t('auth.register.haveAccount')}{' '}
            <Link
              href={`/${locale}/sign-in`}
              className="font-medium text-brand hover:underline underline-offset-4"
            >
              {t('action.signIn')}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
