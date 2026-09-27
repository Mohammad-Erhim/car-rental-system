import { useI18n } from '@carrental/i18n/react';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { I18nManager, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { flushAuthCookies } from '../api/cookies';
import { useTheme } from '../theme/theme-provider';

/**
 * Any locale change — the user's own pick in Settings, or an account's saved preference applied
 * on sign-in (FR-IAM-006, `auth-provider.tsx`) — needs a real process restart before it's fully
 * applied: `I18nManager.forceRTL` only takes effect on the next launch, and a soft/in-place reload
 * risks leaving native view trees, cached layout math, and this same locale check itself
 * disagreeing about which language is actually active. So this is mandatory, not a dismissible
 * hint — the alternative is a silently half-switched app.
 *
 * `bootLocale` is captured once, at first render of this launch, and compared against the live
 * `locale` from `useI18n()` — so this fires for *any* drift from what the process actually booted
 * with, not just an RTL⇄LTR direction change.
 */
export function LanguageRestartModal() {
  const { locale, direction, t } = useI18n();
  const { colors } = useTheme();
  const [bootLocale] = useState(locale);
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState(false);

  if (locale === bootLocale) return null;

  const restart = async () => {
    setRestarting(true);
    setFailed(false);
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(direction === 'rtl');
    // Durably persist the refresh-token cookie before the process exits, so the silent
    // `/auth/refresh` on next launch (`auth-provider.tsx`) has something to redeem.
    await flushAuthCookies();
    try {
      // `Updates.reloadAsync()` only refuses to run in dev mode (a `__DEV__` guard) — it has no
      // dependency on an EAS Update channel being configured; with none, it simply reloads the
      // embedded bundle, which is exactly a full native relaunch. (`react-native-restart` was
      // tried first here and dropped: its native module doesn't expose `restart` under this app's
      // New Architecture / bridgeless setup — verified on-device, not a config issue to chase.)
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
      setFailed(true);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('mobile.restartRequired.title')}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {failed ? t('mobile.restartFailedManual') : t('mobile.restartForLanguage')}
          </Text>
          {!failed && (
            <Pressable
              onPress={restart}
              disabled={restarting}
              style={[styles.button, { backgroundColor: colors.primary, opacity: restarting ? 0.6 : 1 }]}
            >
              <Text style={styles.buttonText}>{t('mobile.restartNow')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 20, gap: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
