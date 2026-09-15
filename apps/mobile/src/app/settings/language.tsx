import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Screen, Text } from '../../components/ui';
import { useTheme } from '../../lib/theme/theme-provider';

export default function LanguageScreen() {
  const { t, locale, locales, setLocale } = useI18n();
  const { colors, space } = useTheme();

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: t('lang.switcher.label') }} />
      <View style={{ paddingTop: space(2) }}>
        {locales.map((l) => {
          const active = l.code === locale;
          return (
            <Pressable
              key={l.code}
              onPress={() => setLocale(l.code)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space(4),
                paddingVertical: space(3.5),
              }}
            >
              <View>
                <Text variant="body">{l.nativeName}</Text>
                <Text variant="small" color="mutedForeground">
                  {l.englishName}
                </Text>
              </View>
              {active && <Check size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
