import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Screen, Text } from '../../components/ui';
import { useTheme, type ThemePreference } from '../../lib/theme/theme-provider';

const OPTIONS: Array<{ value: ThemePreference; labelKey: 'theme.light' | 'theme.dark' | 'theme.system' }> = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
  { value: 'system', labelKey: 'theme.system' },
];

export default function AppearanceScreen() {
  const { t } = useI18n();
  const { colors, space, preference, setPreference } = useTheme();

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: t('theme.label') }} />
      <View style={{ paddingTop: space(2) }}>
        {OPTIONS.map((opt) => {
          const active = opt.value === preference;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space(4),
                paddingVertical: space(3.5),
              }}
            >
              <Text variant="body">{t(opt.labelKey)}</Text>
              {active && <Check size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
