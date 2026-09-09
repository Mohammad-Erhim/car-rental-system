import { useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  Button,
  ErrorSummary,
  Field,
  Input,
  PasswordInput,
} from '@carrental/ui';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiFetch } from '../../lib/api.js';

import { AuthPanel } from './auth-panel.js';

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
  const errs = useFormErrors({
    email: t('auth.email'),
    code: t('auth.recoveryCode'),
    newPassword: t('auth.newPassword'),
  });

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
    <AuthPanel
      icon={<KeyRound className="size-6" />}
      title={t('auth.recoverTitle')}
      footer={
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
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
                <PasswordInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  revealLabel={t('auth.showPw')}
                  hideLabel={t('auth.hidePw')}
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
            <Button className="w-full" onClick={() => navigate('/sign-in')}>
              {t('action.signIn')}
            </Button>
          </div>
        )}
      </div>
    </AuthPanel>
  );
}
