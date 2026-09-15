import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <ThemeProvider>
              <ToastProvider>
                <BottomSheetModalProvider>
                  <AuthProvider defaultAudience="customer">
                    <StepUpProvider>
                      <AppLockGate>
                        <RootNavigator />
                      </AppLockGate>
                    </StepUpProvider>
                  </AuthProvider>
                </BottomSheetModalProvider>
              </ToastProvider>
            </ThemeProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
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
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="vehicles/[categoryCode]"
          options={{ headerShown: true, headerTitle: '', headerTransparent: true, headerTintColor: colors.foreground }}
        />
        <Stack.Screen name="search-results" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="checkout/index" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="trips/[reference]/index" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="trips/[reference]/invoice" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="trips/[reference]/receipt" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="account/profile" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="account/drivers" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="account/data" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="account/payments" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="settings/index" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="settings/language" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="legal/[slug]" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="help" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="locations" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
