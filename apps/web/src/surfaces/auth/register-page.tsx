import type { SessionResponse } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ErrorSummary,
  Field,
  Input,
} from '@carrental/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { takeReturnTo } from '../../lib/return-to.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

type RegisterResult = {
  accountId: string;
  challengeId: string;
  channel: string;
  message: string;
  expiresAt: string;
  devCode?: string;
};

/**
 * SCREEN-CUS-009 — Register and verify contact. Same-screen verification state
 * (design §8.1). On verify, an active session is minted and the origin task resumes.
 */
export function RegisterPage() {
  const { t } = useI18n();
  const { applySession } = useAuth();
  const navigate = useNavigate();

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
    fullName: 'Full name',
    email: 'Email',
    password: 'Password',
    acceptTerms: 'Terms',
    code: 'Code',
  });

  async function submitForm(e: React.FormEvent) {
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
          localeCode: 'en',
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

  async function submitCode(e: React.FormEvent) {
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
      navigate(takeReturnTo('/account'), { replace: true });
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
    <div className="mx-auto w-full max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle>{step === 'form' ? t('action.register') : 'Verify your email'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
          {errs.topLevelMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errs.topLevelMessage}</AlertDescription>
            </Alert>
          ) : null}

          {step === 'form' ? (
            <form onSubmit={submitForm} className="space-y-4" noValidate>
              <Field
                label="Full name"
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
              <Field label="Email" htmlFor="field-email" required error={errs.fieldError('email')}>
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
                label="Password"
                htmlFor="field-password"
                required
                hint="At least 10 characters."
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
                  I accept the account and privacy terms.{' '}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                <span>Send me occasional offers (optional).</span>
              </label>

              <Button type="submit" className="w-full" loading={busy} loadingLabel="Creating…">
                {t('action.register')}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to <span className="font-medium">{email}</span>. It expires
                in 15 minutes.
              </p>
              {pending?.devCode ? (
                <Alert variant="info">
                  <AlertDescription>
                    Development: your code is{' '}
                    <span className="bidi-isolate font-mono">{pending.devCode}</span>
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field
                label="Verification code"
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
              <Button type="submit" className="w-full" loading={busy} loadingLabel="Verifying…">
                {t('action.confirm')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={resend}
                disabled={busy}
              >
                Resend code
              </Button>
            </form>
          )}

          {step === 'form' ? (
            <p className="text-center text-sm">
              Already have an account?{' '}
              <Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
                {t('action.signIn')}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
