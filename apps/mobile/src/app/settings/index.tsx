import { useI18n } from '@carrental/i18n/react';
import * as Application from 'expo-application';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Divider, ListRow, Screen, SwitchRow, Text } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useAppLock } from '../../lib/auth/app-lock-store';
import { useAuth } from '../../lib/auth/auth-provider';
import { registerForPushNotificationsAsync } from '../../lib/notifications/push';
import { useTheme } from '../../lib/theme/theme-provider';

export default function SettingsScreen() {
  const { t } = useI18n();
  const { space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { signOut } = useAuth();
  const appLock = useAppLock();

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState(t('mobile.biometric.fingerprint'));
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && enrolled);
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        // "Face ID" is an Apple trademark for iOS's specific implementation — Android's
        // equivalent (whatever the OEM brands it) is generic "face unlock" in every Android
        // system UI string, the same way the fingerprint branch below already distinguishes
        // "Touch ID" from a platform-neutral "fingerprint unlock".
        setBiometricLabel(Platform.OS === 'ios' ? t('mobile.biometric.faceId') : t('mobile.biometric.faceUnlock'));
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel(Platform.OS === 'ios' ? t('mobile.biometric.touchId') : t('mobile.biometric.fingerprint'));
      }
    })();
    Notifications.getPermissionsAsync().then(({ status }) => setPushEnabled(status === 'granted'));
  }, [t]);

  const toggleBiometric = async (next: boolean) => {
    if (next) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('mobile.biometric.unlockPrompt') });
      if (!result.success) return;
    }
    appLock.setEnabled(next);
  };

  const togglePush = async (next: boolean) => {
    if (next) {
      const { result } = await registerForPushNotificationsAsync();
      setPushEnabled(result === 'granted');
      if (result === 'denied') toast.show(t('mobile.push.deniedHint'));
    } else {
      toast.show(t('mobile.push.deniedHint'));
    }
  };

  return (
    <Screen padded={false} scroll>
      <Stack.Screen options={{ title: t('mobile.settings.title') }} />

      <SectionLabel text={t('mobile.settings.appearance')} />
      <ListRow label={t('theme.label')} onPress={() => router.push('/settings/appearance')} />
      <ListRow label={t('lang.switcher.label')} onPress={() => router.push('/settings/language')} />

      <Divider />
      <SectionLabel text={t('mobile.settings.notifications')} />
      <View style={{ paddingHorizontal: space(4) }}>
        <SwitchRow
          label={t('mobile.push.title')}
          hint={t('mobile.push.body')}
          value={!!pushEnabled}
          onValueChange={togglePush}
        />
      </View>

      <Divider />
      <SectionLabel text={t('mobile.settings.security')} />
      <View style={{ paddingHorizontal: space(4) }}>
        <SwitchRow
          label={t('mobile.biometric.enableTitle')}
          hint={t('mobile.biometric.enableBody', { method: biometricLabel })}
          value={appLock.enabled}
          onValueChange={toggleBiometric}
          disabled={!biometricAvailable}
        />
      </View>

      <Divider />
      <SectionLabel text={t('mobile.settings.about')} />
      <ListRow label={t('site.footer.terms')} onPress={() => router.push('/legal/terms')} />
      <ListRow label={t('site.footer.privacy')} onPress={() => router.push('/legal/privacy')} />
      <ListRow label={t('site.cookie.cookiePolicy')} onPress={() => router.push('/legal/cookies')} />
      <ListRow label={t('mobile.settings.version', { version: Application.nativeApplicationVersion ?? '1.0.0' })} showChevron={false} />

      <Divider />
      <ListRow label={t('mobile.settings.signOutEverywhere')} destructive onPress={() => void signOut(true)} showChevron={false} />
    </Screen>
  );
}

function SectionLabel({ text }: { text: string }) {
  const { space } = useTheme();
  return (
    <Text variant="caption" color="mutedForeground" style={{ paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(1) }}>
      {text.toUpperCase()}
    </Text>
  );
}
