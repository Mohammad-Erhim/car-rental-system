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
import { usePushPreference } from '../../lib/notifications/push-preference-store';
import { useTheme } from '../../lib/theme/theme-provider';

export default function SettingsScreen() {
  const { t } = useI18n();
  const { space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { status, signOut } = useAuth();
  const authenticated = status === 'authenticated';
  const appLock = useAppLock();

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState(t('mobile.biometric.fingerprint'));
  const pushPreference = usePushPreference();
  // Falls back to the live OS permission grant only when the user has never explicitly chosen —
  // once they have, that choice (including "off") is what the switch reflects, not the OS grant,
  // which an app can request but never revoke. `osPushEnabled` only exists for that fallback
  // case; when a preference is already known there's nothing async to wait on, so it's read
  // directly rather than mirrored into state.
  const [osPushEnabled, setOsPushEnabled] = useState<boolean | null>(null);
  const pushEnabled = pushPreference.enabled ?? osPushEnabled;

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
    if (pushPreference.enabled === null) {
      Notifications.getPermissionsAsync().then(({ status }) => setOsPushEnabled(status === 'granted'));
    }
  }, [t, pushPreference.enabled]);

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
      pushPreference.setEnabled(result === 'granted');
      if (result === 'denied') toast.show(t('mobile.push.deniedHint'));
      // 'unsupported' (a simulator, or a device with no push capability) previously showed
      // nothing at all — the user taps the switch, it silently stays off, no explanation.
      if (result === 'unsupported') toast.show(t('mobile.push.unsupportedHint'));
    } else {
      // Neither Android nor iOS lets an app programmatically revoke a permission it was already
      // granted (only request it) — turning this off is therefore an in-app preference, not an
      // OS-level change, persisted so it survives navigating away and app restarts instead of
      // reverting to the (still-granted) OS permission next time this screen reads it.
      pushPreference.setEnabled(false);
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

      {authenticated && (
        <>
          <Divider />
          <ListRow label={t('mobile.settings.signOutEverywhere')} destructive onPress={() => void signOut(true)} showChevron={false} />
        </>
      )}
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
