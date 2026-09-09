'use client';

import { useAuth, useFormErrors } from '@carrental/client/react';
import { LOCALES, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Button,
  Checkbox,
  ErrorSummary,
  Field,
  Input,
  useToast,
} from '@carrental/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useProfile, useUpdateProfile } from '../../../../lib/customer-hooks';

/** SCREEN-CUS-012 — profile & preferences (FR-IAM-006). Stale concurrent change → 409 → reload. */
export default function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const { actor } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useProfile(!!actor);
  const update = useUpdateProfile();
  const { toast } = useToast();
  const errs = useFormErrors({ fullName: t('auth.fullName') });

  const [fullName, setFullName] = useState('');
  const [localeCode, setLocaleCode] = useState('en');
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setLocaleCode(profile.localeCode);
      setMarketingEmail(!!profile.communicationPrefs.marketingEmail);
      setStale(false);
    }
  }, [profile]);

  if (isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (isError || !profile) {
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        primaryAction={{ label: t('action.retry'), onClick: () => refetch() }}
      />
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    errs.clear();
    setStale(false);
    try {
      const next = await update.mutateAsync({
        patch: { fullName, localeCode, communicationPrefs: { marketingEmail } },
        version: profile!.version,
      });
      if (next.localeCode !== locale) {
        setLocale(next.localeCode);
        // move the URL onto the new locale too, or a reload/Back would fall back to the old one
        router.replace(`/${next.localeCode}/account/profile`);
      }
      toast({ title: t('profile.saved'), description: t('profile.savedHint'), variant: 'success' });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 409
      ) {
        setStale(true);
        void refetch();
        return;
      }
      errs.fromError(err);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{t('profile.title')}</h1>
      {stale ? (
        <AppStateView
          kind="stale"
          inline
          title={t('state.stale.title')}
          description={t('profile.staleReloaded')}
        />
      ) : null}

      <section className="surface-card rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('profile.identityLanguage')}</h2>
        <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
        <form onSubmit={save} className="space-y-4" noValidate>
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
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={t('auth.email')} htmlFor="field-email">
            {({ id }) => (
              <Input
                id={id}
                value={profile.email}
                disabled
                readOnly
                aria-describedby="email-note"
              />
            )}
          </Field>
          <p id="email-note" className="-mt-2 text-xs text-ink-muted">
            {t('profile.emailNote')}
          </p>

          <Field label={t('profile.language')} htmlFor="field-locale">
            {({ id }) => (
              <select
                id={id}
                className="flex h-11 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                value={localeCode}
                onChange={(e) => setLocaleCode(e.target.value)}
              >
                {SUPPORTED_LOCALE_CODES.map((code) => (
                  <option key={code} value={code} className="bg-surface text-ink">
                    {LOCALES[code]?.nativeName} ({LOCALES[code]?.englishName})
                  </option>
                ))}
              </select>
            )}
          </Field>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={marketingEmail}
              onChange={(e) => setMarketingEmail(e.target.checked)}
            />
            <span>
              {t('profile.marketingEmail')}
              <span className="mt-0.5 block text-xs text-ink-muted">
                {t('profile.operationalNote')}
              </span>
            </span>
          </label>

          <Button type="submit" loading={update.isPending}>
            {t('action.save')}
          </Button>
        </form>
      </section>
    </div>
  );
}
