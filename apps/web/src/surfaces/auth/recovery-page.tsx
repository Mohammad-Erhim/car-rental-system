import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorSummary,
  Field,
  Input,
} from '@carrental/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiFetch } from '../../lib/api.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

type StartResult = {
  challengeId: string | null;
  channel: string | null;
  message: string;
  devCode?: string;
};

/** SCREEN-CUS-010 — Account recovery through a verified channel (FR-IAM-004). */
export function RecoveryPage({ audience = 'customer' as 'customer' | 'staff' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<'start' | 'complete' | 'done'>('start');
  const [email, setEmail] = useState('');
  const [started, setStarted] = useState<StartResult | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const errs = useFormErrors({ email: 'Email', code: 'Code', newPassword: 'New password' });

  async function start(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    setBusy(true);
    try {
      const res = await apiFetch<StartResult>('/auth/recovery/start', {
        method: 'POST',
        anonymous: true,
        body: { email, audience },
      });
      setStarted(res);
      setStep('complete');
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    if (!started?.challengeId) {
      // neutral path: no account matched — nothing to complete
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
    <div className="mx-auto w-full max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle>Recover your account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
          {errs.topLevelMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errs.topLevelMessage}</AlertDescription>
            </Alert>
          ) : null}

          {step === 'start' ? (
            <form onSubmit={start} className="space-y-4" noValidate>
              <Field
                label="Account email"
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
                Send recovery instructions
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
                    Development: your code is{' '}
                    <span className="bidi-isolate font-mono">{started.devCode}</span>
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field
                label="Recovery code"
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
                label="New password"
                htmlFor="field-newPassword"
                required
                hint="At least 10 characters."
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
                <AlertDescription>
                  If an account matched, its password has been reset and all sessions were signed
                  out. A security notification was sent.
                </AlertDescription>
              </Alert>
              <Button
                className="w-full"
                onClick={() => navigate(audience === 'staff' ? '/ops/sign-in' : '/sign-in')}
              >
                {t('action.signIn')}
              </Button>
            </div>
          )}

          <p className="text-center text-sm">
            <Link
              to={audience === 'staff' ? '/ops/sign-in' : '/sign-in'}
              className="text-primary underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
