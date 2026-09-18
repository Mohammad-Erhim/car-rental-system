import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Divider, Screen, Text } from '../../components/ui';
import { useTheme } from '../../lib/theme/theme-provider';
import { withAlpha } from '../../lib/theme/tokens';

export default function LanguageScreen() {
  const { t, locale, locales, setLocale } = useI18n();
  const { colors, radius, space } = useTheme();

  return (
    <Screen padded={false} contentContainerStyle={{ padding: space(4), gap: space(2) }}>
      <Stack.Screen options={{ title: t('lang.switcher.label') }} />
      <View
        style={{
          borderRadius: radius * 1.5,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {locales.map((l, i) => {
          const active = l.code === locale;
          // Each language's own name renders in its own script direction regardless of the app's
          // *current* direction — without this, switching the app to Arabic left every row
          // (including "English"/"Français") right-aligned, since a plain Text with no explicit
          // textAlign defaults to whatever the ambient RTL/LTR context is. A language picker is
          // the one place that ambient direction shouldn't apply: each row names a language in
          // its own script, not the currently-selected one.
          const textStyle = {
            direction: l.direction,
            writingDirection: l.direction,
            // RN 0.74 treats explicit left/right as logical when this text node is RTL.
            textAlign: 'left' as const,
          };
          return (
            <View key={l.code}>
              {i > 0 && <Divider />}
              <Pressable
                onPress={() => setLocale(l.code)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space(3),
                  paddingHorizontal: space(4),
                  paddingVertical: space(3.5),
                  backgroundColor: active
                    ? withAlpha(colors.primary, 0.08)
                    : pressed
                      ? colors.muted
                      : 'transparent',
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" style={textStyle}>
                    {l.nativeName}
                  </Text>
                  <Text variant="small" color="mutedForeground" style={textStyle}>
                    {l.englishName}
                  </Text>
                </View>
                {active && <Check size={20} color={colors.primary} />}
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
