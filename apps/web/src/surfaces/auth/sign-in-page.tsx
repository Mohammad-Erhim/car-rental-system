import { stashReturnTo, takeReturnTo } from '@carrental/client';
import { useAuth, useFormErrors } from '@carrental/client/react';
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
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthPanel } from './auth-panel.js';

/**
 * SCREEN-CUS-008 / SCREEN-OPS-001. Authenticate and return to the intended task
 * (FLOW-CUS-002, SRS-UI-006). `audience` selects the customer vs staff variant.
 */
export function SignInPage({ audience = 'customer' as 'customer' | 'staff' }) {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const errs = useFormErrors({ email: t('auth.email'), password: t('auth.password') });

  const returnParam = params.get('returnTo');
  if (returnParam && returnParam.startsWith('/')) stashReturnTo(returnParam);

  const isStaff = audience === 'staff';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    setBusy(true);
    try {
      await signIn({ email, password, audience });
      // This router (apps/web) runs under basename `/ops`; `/` is the dashboard index.
      navigate(takeReturnTo('/'), { replace: true });
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPanel
      title={isStaff ? t('auth.staffTitle') : t('action.signIn')}
      subtitle={isStaff ? t('auth.staffSubtitle') : undefined}
      footer={
        <div className="flex items-center justify-center gap-4">
          <Link to="/recovery" className="font-medium text-primary hover:underline">
            {t('auth.forgotPw')}
          </Link>
          {!isStaff ? (
            <Link to="/register" className="font-medium text-primary hover:underline">
              {t('action.register')}
            </Link>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
        {errs.topLevelMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errs.topLevelMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label={isStaff ? t('auth.staffEmail') : t('auth.email')}
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
              <PasswordInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                revealLabel={t('auth.showPw')}
                hideLabel={t('auth.hidePw')}
              />
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
      </div>
    </AuthPanel>
  );
}
