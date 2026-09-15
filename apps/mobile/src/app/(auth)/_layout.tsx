import { useI18n } from '@carrental/i18n/react';
import { Stack, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

export default function AuthLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('action.back')}>
            <X size={22} color={colors.foreground} />
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: '' }} />
      <Stack.Screen name="register" options={{ title: '' }} />
      <Stack.Screen name="recovery" options={{ title: '' }} />
    </Stack>
  );
}
