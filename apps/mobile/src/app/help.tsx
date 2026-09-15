import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Screen, Text } from '../components/ui';
import { useTheme } from '../lib/theme/theme-provider';

const FAQ_KEYS = ['booking', 'changes', 'payment', 'pickup'] as const;

export default function HelpScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const [open, setOpen] = useState<string | null>(FAQ_KEYS[0]);

  return (
    <Screen scroll contentContainerStyle={{ gap: space(5) }}>
      <Stack.Screen options={{ title: t('site.help.title') }} />
      <View style={{ gap: space(1) }}>
        <Text variant="display">{t('site.help.title')}</Text>
        <Text variant="body" color="mutedForeground">
          {t('site.help.intro')}
        </Text>
      </View>

      <View style={{ gap: space(3) }}>
        {FAQ_KEYS.map((key) => {
          const isOpen = open === key;
          return (
            <Card key={key} padded={false}>
              <Pressable
                onPress={() => setOpen(isOpen ? null : key)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space(4) }}
              >
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {t(`site.help.faq.${key}.q` as 'site.help.faq.booking.q')}
                </Text>
                <ChevronDown size={18} color={colors.mutedForeground} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
              </Pressable>
              {isOpen && (
                <Text variant="small" color="mutedForeground" style={{ paddingHorizontal: space(4), paddingBottom: space(4) }}>
                  {t(`site.help.faq.${key}.a` as 'site.help.faq.booking.a')}
                </Text>
              )}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
