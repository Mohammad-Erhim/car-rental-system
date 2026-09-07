import { LOCALES, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ErrorSummary,
  Field,
  Input,
  useToast,
} from '@carrental/ui';
import { useEffect, useState } from 'react';

import { useProfile, useUpdateProfile } from '../../lib/api-hooks.js';
import { useAuth } from '../../lib/auth.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

/**
 * SCREEN-CUS-012 — Profile & preferences (FR-IAM-006). Sections save independently; a stale
 * concurrent change is surfaced (409 → STALE). Historical agreements are not rewritten.
 */
export function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const { actor } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useProfile(!!actor);
  const update = useUpdateProfile();
  const { toast } = useToast();
  const errs = useFormErrors({ fullName: 'Full name' });

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

  if (isLoading) {
    return <AppStateView kind="loading" title={t('state.loading.title')} />;
  }
  if (isError || !profile) {
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        primaryAction={{ label: t('action.retry'), onClick: () => refetch() }}
      />
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    setStale(false);
    try {
      const next = await update.mutateAsync({
        patch: { fullName, localeCode, communicationPrefs: { marketingEmail } },
        version: profile!.version,
      });
      // re-render the app chrome whenever the saved language differs from what's on screen
      if (next.localeCode !== locale) setLocale(next.localeCode);
      toast({
        title: 'Profile saved',
        description: 'Changes apply to future activity.',
        variant: 'success',
      });
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
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Profile &amp; preferences</h1>

      {stale ? (
        <AppStateView
          kind="stale"
          inline
          title={t('state.stale.title')}
          description="Your profile changed in another place. We reloaded the latest values — review and save again."
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity &amp; language</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
          <form onSubmit={save} className="space-y-4" noValidate>
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
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Email" htmlFor="field-email">
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
            <p id="email-note" className="-mt-2 text-xs text-muted-foreground">
              Changing a verified email requires re-verification (available soon).
            </p>

            <Field label="Language" htmlFor="field-locale">
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={localeCode}
                  onChange={(e) => setLocaleCode(e.target.value)}
                >
                  {SUPPORTED_LOCALE_CODES.map((code) => (
                    <option key={code} value={code}>
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
                Send me occasional offers by email.
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Operational messages (booking, payment, pickup) are always sent and are not
                  optional.
                </span>
              </span>
            </label>

            <Button type="submit" loading={update.isPending}>
              {t('action.save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
