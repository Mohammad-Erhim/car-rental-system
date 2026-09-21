import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmProvider } from '../components/ui/confirm-dialog';
import { ToastProvider } from '../components/ui/toast';
import { AppLockGate } from '../lib/auth/app-lock-gate';
import { AuthProvider } from '../lib/auth/auth-provider';
import { StepUpProvider } from '../lib/auth/step-up-provider';
import { I18nProvider } from '../lib/i18n/i18n-provider';
import { onNotificationTapped, configureNotificationHandler } from '../lib/notifications/push';
import { ONBOARDING_SEEN_KEY } from '../lib/onboarding';
import { queryClient } from '../lib/query-client-instance';
import { ThemeProvider, useTheme } from '../lib/theme/theme-provider';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotificationHandler();

export default function RootLayout() {
  // No custom brand font is bundled yet (see `packages/theme`'s FONTS catalogue) — this app
  // intentionally renders on the OS system font, which already covers Latin + Arabic well. This
  // hook exists as the one line to change once a curated font is added as an asset.
  const [fontsReady] = useFonts({});

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <I18nProvider>
              <ThemeProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <BottomSheetModalProvider>
                      <AuthProvider defaultAudience="customer">
                        <StepUpProvider>
                          <AppLockGate>
                            <RootNavigator />
                          </AppLockGate>
                        </StepUpProvider>
                      </AuthProvider>
                    </BottomSheetModalProvider>
                  </ConfirmProvider>
                </ToastProvider>
              </ThemeProvider>
            </I18nProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { colors, mode } = useTheme();
  const router = useRouter();

  // System chrome (status bar background on Android, the area behind it) tracks the resolved
  // brand background so a themed org never shows a mismatched system bar.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  // A tapped notification (booking confirmed, car ready, plans changed) deep-links straight to
  // the relevant trip instead of just opening the app to its default screen.
  useEffect(() => {
    return onNotificationTapped((data) => {
      const reference = typeof data.reservationReference === 'string' ? data.reservationReference : null;
      if (reference) router.push(`/trips/${reference}`);
    });
  }, [router]);

  // First launch only — once dismissed, this key persists and every later launch skips straight
  // past it (a fresh install, not a fresh session, is what re-triggers onboarding).
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((seen) => {
      if (seen !== '1') router.replace('/onboarding');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time check on mount
  }, []);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerTitleStyle: { color: colors.foreground },
          // iOS only: without this, a screen with no explicit back-title config (the "(tabs)"
          // group entry below, most visibly) falls back to showing its raw route name next to
          // the back chevron — e.g. literally "(tabs)". Android's back button is icon-only
          // regardless, so this never surfaced there. Forcing it off globally beats blanking
          // `headerBackTitle` per screen, which is exactly the approach that missed this case.
          headerBackTitleVisible: false,
          contentStyle: { backgroundColor: colors.background },
          // Hardcoded to always slide from the right regardless of locale, so a forward push in
          // Arabic looked backwards — it should slide in from the reading-start side, which is the
          // left in RTL. native-stack's own 'default' animation is RTL-aware automatically, but
          // that's a platform-native transition rather than this explicit slide, so mirror the
          // direction by hand instead of switching styles.
          animation: I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="vehicles/[categoryCode]"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="search-results" options={{ headerShown: true }} />
        <Stack.Screen name="checkout/index" options={{ headerShown: true }} />
        <Stack.Screen name="trips/[reference]/index" options={{ headerShown: true }} />
        <Stack.Screen name="trips/[reference]/invoice" options={{ headerShown: true }} />
        <Stack.Screen name="trips/[reference]/receipt" options={{ headerShown: true }} />
        <Stack.Screen name="account/profile" options={{ headerShown: true }} />
        <Stack.Screen name="account/drivers" options={{ headerShown: true }} />
        <Stack.Screen name="account/data" options={{ headerShown: true }} />
        <Stack.Screen name="account/payments" options={{ headerShown: true }} />
        <Stack.Screen name="settings/index" options={{ headerShown: true }} />
        <Stack.Screen name="settings/language" options={{ headerShown: true }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: true }} />
        <Stack.Screen name="settings/currency" options={{ headerShown: true }} />
        <Stack.Screen name="legal/[slug]" options={{ headerShown: true }} />
        <Stack.Screen name="help" options={{ headerShown: true }} />
        <Stack.Screen name="locations" options={{ headerShown: true }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
