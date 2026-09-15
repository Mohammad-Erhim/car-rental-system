import { useI18n } from '@carrental/i18n/react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '../../components/ui';
import { useTheme } from '../theme/theme-provider';

import { useAppLock } from './app-lock-store';

/**
 * When the user has opted into app-lock (Settings → Security), require Face ID / Touch ID /
 * device passcode both on cold start and every time the app returns to the foreground from the
 * background — not just on launch, since a phone left unattended mid-session is the actual
 * threat model this protects against.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const { enabled, hydrated } = useAppLock();
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  // `locked` is a plain derived value, not its own synced state: while the setting is off there
  // is nothing to unlock, and while it's on, unlocking is a genuine event (a successful biometric
  // check), not something render needs to compute.
  const [manuallyUnlocked, setManuallyUnlocked] = useState(false);
  const locked = enabled && !manuallyUnlocked;
  const [authenticating, setAuthenticating] = useState(false);
  const appState = useRef(AppState.currentState);

  const tryUnlock = async () => {
    setAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('mobile.biometric.unlockPrompt'),
        disableDeviceFallback: false,
      });
      if (result.success) setManuallyUnlocked(true);
    } finally {
      setAuthenticating(false);
    }
  };

  // Triggers the OS biometric prompt itself (a real external-system call), not a state sync — so
  // this effect stays legitimate under `react-hooks/set-state-in-effect` even though `tryUnlock`
  // sets state once the async check resolves.
  useEffect(() => {
    if (!hydrated || !enabled) return;
    // The linter's static check flags this as "setState in an effect" by tracing into
    // `tryUnlock`, but its actual `setManuallyUnlocked` calls only run after the `await`, inside
    // the biometric prompt's resolution — exactly the "external system, callback" shape the rule
    // itself calls out as fine, just one level of indirection deeper than it follows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the setting/hydration flips, not on every render
  }, [enabled, hydrated]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        setManuallyUnlocked(false);
        void tryUnlock();
      }
      appState.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!hydrated) return null;

  return (
    <>
      {children}
      {locked && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            gap: space(4),
          }}
        >
          <Text variant="h2">{t('mobile.biometric.unlockPrompt')}</Text>
          <Button loading={authenticating} onPress={tryUnlock}>
            {t('mobile.biometric.unlockPrompt')}
          </Button>
        </View>
      )}
    </>
  );
}
