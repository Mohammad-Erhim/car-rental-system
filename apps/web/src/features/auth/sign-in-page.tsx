import { stashReturnTo, takeReturnTo } from '@carrental/client';
import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { AuthCard } from './auth-card';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useServerFormErrors } from '@/lib/use-server-form-errors';

/** SCREEN-OPS-001 — staff sign-in. Returns to the task the user was sent away from (SRS-UI-006). */
export function SignInPage() {
  const { t } = useI18n();
  const { signIn, status, actor } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t('error.field.required')).email(t('error.field.invalid')),
        password: z.string().min(1, t('error.field.required')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const serverErrors = useServerFormErrors(form);
  const { isSubmitting } = form.formState;

  // A localStorage write is a side effect and must not run during render — effect, not the body.
  const returnParam = params.get('returnTo');
  useEffect(() => {
    if (returnParam?.startsWith('/')) stashReturnTo(returnParam);
  }, [returnParam]);

  // Someone who opens /sign-in while already signed in has nothing to do here. (During a submit
  // the handler below owns the redirect so the return target isn't consumed twice.)
  const alreadySignedIn = status === 'authenticated' && actor?.kind === 'staff';
  useEffect(() => {
    if (alreadySignedIn && !form.formState.isSubmitting) navigate('/', { replace: true });
  }, [alreadySignedIn, form.formState.isSubmitting, navigate]);

  async function onSubmit(values: Values) {
    serverErrors.clear();
    try {
      await signIn({ ...values, audience: 'staff' });
      // This router runs under basename `/ops`; `/` is the dashboard index.
      navigate(takeReturnTo('/'), { replace: true });
    } catch (err) {
      serverErrors.handle(err);
    }
  }

  return (
    <AuthCard
      title={t('auth.staffTitle')}
      subtitle={t('auth.staffSubtitle')}
      footer={
        <>
          {t('auth.staff.noAccount')}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t('auth.staff.acceptInvite')}
          </Link>
        </>
      }
    >
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
                <FormLabel>{t('auth.staffEmail')}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="username" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t('auth.password')}</FormLabel>
                  <Link
                    to="/recovery"
                    className="text-sm font-medium text-primary hover:underline"
                    tabIndex={-1}
                  >
                    {t('auth.forgotPw')}
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput
                    autoComplete="current-password"
                    showLabel={t('auth.showPw')}
                    hideLabel={t('auth.hidePw')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            {isSubmitting ? t('auth.signingIn') : t('action.signIn')}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
