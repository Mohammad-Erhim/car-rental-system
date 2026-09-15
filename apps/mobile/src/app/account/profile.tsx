import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppStateView, Button, ErrorSummary, Field, Input, Screen, Text } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useProfile, useUpdateProfile } from '../../lib/api/hooks/use-account';
import { useFormErrors } from '../../lib/api/hooks/use-form-errors';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';

export default function ProfileScreen() {
  const { t, locale, setLocale } = useI18n();
  const { colors, space } = useTheme();
  const { actor } = useAuth();
  const toast = useToast();
  const profileQuery = useProfile(!!actor);
  const update = useUpdateProfile();
  const errs = useFormErrors({ fullName: t('auth.fullName') });

  const [fullName, setFullName] = useState('');
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [stale, setStale] = useState(false);

  // Seeds editable local state from the fetched profile — the same pattern
  // `apps/site`'s profile page uses (its own effect, byte-for-byte), kept identical rather than
  // restructured around a newer lint idiom so the two surfaces stay easy to compare side by side.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (profileQuery.data) {
      setFullName(profileQuery.data.fullName);
      setMarketingEmail(!!profileQuery.data.communicationPrefs.marketingEmail);
      setStale(false);
    }
  }, [profileQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <AppStateView kind="loading" />
      </Screen>
    );
  }
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <Screen>
        <AppStateView kind="failure" onRetry={() => profileQuery.refetch()} />
      </Screen>
    );
  }

  const profile = profileQuery.data;

  const save = async () => {
    errs.clear();
    setStale(false);
    try {
      const next = await update.mutateAsync({
        patch: { fullName, communicationPrefs: { marketingEmail } },
        version: profile.version,
      });
      if (next.localeCode !== locale) setLocale(next.localeCode);
      toast.show(t('profile.saved'), 'success');
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        setStale(true);
        void profileQuery.refetch();
        return;
      }
      errs.fromError(err);
    }
  };

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(5) }}>
      <Stack.Screen options={{ title: t('profile.title') }} />

      {stale && <AppStateView kind="stale" inline description={t('profile.staleReloaded')} />}

      <ErrorSummary items={errs.summary} />

      <Text variant="h3">{t('profile.identityLanguage')}</Text>

      <Field label={t('auth.fullName')} required error={errs.fieldError('fullName')}>
        <Input value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      </Field>

      <Field label={t('auth.email')} hint={t('profile.emailNote')}>
        <Input value={profile.email} editable={false} style={{ opacity: 0.6 }} />
      </Field>

      <Pressable onPress={() => setMarketingEmail((v) => !v)} style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-start' }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            borderWidth: 1.5,
            borderColor: marketingEmail ? colors.primary : colors.border,
            backgroundColor: marketingEmail ? colors.primary : 'transparent',
            marginTop: 1,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text variant="small">{t('profile.marketingEmail')}</Text>
          <Text variant="caption" color="mutedForeground">
            {t('profile.operationalNote')}
          </Text>
        </View>
      </Pressable>

      <Button fullWidth loading={update.isPending} onPress={save}>
        {t('action.save')}
      </Button>
    </Screen>
  );
}
