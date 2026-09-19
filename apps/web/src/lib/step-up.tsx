import { useI18n } from '@carrental/i18n/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { apiFetch, ApiError, registerStepUpHandler } from './api.js';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';

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
        <DialogContent
          data-testid="step-up-dialog"
          closeLabel={t('action.close')}
          className="max-w-sm"
        >
          <DialogHeader>
            <DialogTitle>{t('stepUp.title')}</DialogTitle>
            <DialogDescription>{t('stepUp.body')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="step-up-password">{t('stepUp.password')}</Label>
              <PasswordInput
                id="step-up-password"
                autoComplete="current-password"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'step-up-error' : undefined}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                data-testid="step-up-password"
                showLabel={t('auth.showPw')}
                hideLabel={t('auth.hidePw')}
              />
              {error ? (
                <p id="step-up-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => settle(false)}>
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
