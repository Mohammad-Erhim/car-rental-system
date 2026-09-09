import { useI18n } from '@carrental/i18n/react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  PasswordInput,
} from '@carrental/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { apiFetch, ApiError, registerStepUpHandler } from './api.js';

/**
 * SRS-SEC-014 — the client half of step-up auth. `api.ts` calls the registered handler when a
 * request comes back `auth_step_up_required`; this shows a password prompt, POSTs
 * `/auth/step-up`, and resolves true so the original request is retried once.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpen(false);
    setPassword('');
    setError(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    registerStepUpHandler(
      () =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          setError(null);
          setPassword('');
          setOpen(true);
        }),
    );
    return () => registerStepUpHandler(null);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/step-up', { method: 'POST', body: { password } });
      settle(true);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : t('stepUp.failed'));
    }
  }

  return (
    <>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <DialogContent data-testid="step-up-dialog" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('stepUp.title')}</DialogTitle>
            <DialogDescription>{t('stepUp.body')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <Field
              label={t('stepUp.password')}
              htmlFor="step-up-password"
              error={error ?? undefined}
            >
              {({ id, invalid }) => (
                <PasswordInput
                  id={id}
                  autoComplete="current-password"
                  autoFocus
                  invalid={invalid}
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  data-testid="step-up-password"
                  revealLabel={t('auth.showPw')}
                  hideLabel={t('auth.hidePw')}
                />
              )}
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => settle(false)}>
                {t('action.cancel')}
              </Button>
              <Button
                type="submit"
                loading={busy}
                disabled={!password}
                data-testid="step-up-submit"
              >
                {t('stepUp.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
