'use client';

import { stashReturnTo, takeReturnTo } from '@carrental/client';
import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Alert, AlertDescription, Button, ErrorSummary, Field, Input } from '@carrental/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { useLocale } from '../../../../lib/nav';

/** SCREEN-CUS-008 — customer sign-in; returns to the intended task (FLOW-CUS-002, SRS-UI-006). */
function SignInInner() {
  const { t } = useI18n();
  const locale = useLocale();
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const errs = useFormErrors({ email: t('auth.email'), password: t('auth.password') });

  const returnParam = params.get('returnTo');
  if (returnParam && returnParam.startsWith('/') && !returnParam.startsWith('//')) {
    stashReturnTo(returnParam);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    errs.clear();
    setBusy(true);
    try {
      await signIn({ email, password });
      router.replace(takeReturnTo(`/${locale}/account`));
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('action.signIn')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('site.auth.signInSub')}</p>
      </div>
      <div className="space-y-4">
        <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
        {errs.topLevelMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errs.topLevelMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
                autoComplete="username"
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
            error={errs.fieldError('password')}
          >
            {({ id, describedBy, invalid }) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPw((v) => !v)}
                  aria-pressed={showPw}
                >
                  {showPw ? t('auth.hidePw') : t('auth.showPw')}
                </Button>
              </div>
            )}
          </Field>

          <Button
            type="submit"
            className="w-full"
            loading={busy}
            loadingLabel={t('auth.signingIn')}
          >
            {t('action.signIn')}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link
            href={`/${locale}/recovery`}
            className="font-medium text-brand hover:underline underline-offset-4"
          >
            {t('auth.forgotPw')}
          </Link>
          <Link
            href={`/${locale}/register`}
            className="font-medium text-brand hover:underline underline-offset-4"
          >
            {t('action.register')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
