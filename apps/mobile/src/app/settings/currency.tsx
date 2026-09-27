import { pickCurrency } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { AppStateView, Divider, Screen, Text, errorStateKind } from '../../components/ui';
import { useCurrencies } from '../../lib/api/hooks/use-discovery';
import { useCurrencyPreference } from '../../lib/currency/currency-store';
import { useTheme } from '../../lib/theme/theme-provider';
import { withAlpha } from '../../lib/theme/tokens';

/**
 * Which currency prices are shown in (DEC-036). The list is the currencies the business has
 * enabled *and* has prices for — adding or removing one in the dashboard changes it with no app
 * release.
 */
export default function CurrencyScreen() {
  const { t, locale } = useI18n();
  const { colors, radius, space } = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useCurrencies(locale);
  const stored = useCurrencyPreference((s) => s.code);
  const setCode = useCurrencyPreference((s) => s.setCode);

  const current = data
    ? pickCurrency(
        stored,
        data.currencies.map((c) => c.code),
        data.defaultCode,
      )
    : null;

  const choose = (code: string) => {
    setCode(code);
    // prices already on screen were quoted in the old currency
    void queryClient.invalidateQueries({ queryKey: ['discovery'] });
  };

  return (
    <Screen padded={false} contentContainerStyle={{ padding: space(4), gap: space(2) }}>
      <Stack.Screen options={{ title: t('currency.switcher.label') }} />
      {isLoading ? (
        <AppStateView kind="loading" />
      ) : isError || !data ? (
        <AppStateView kind={errorStateKind(error)} onRetry={() => refetch()} />
      ) : (
        <View
          style={{
            borderRadius: radius * 1.5,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {data.currencies.map((c, i) => {
            const active = c.code === current;
            return (
              <View key={c.code}>
                {i > 0 && <Divider />}
                <Pressable
                  onPress={() => choose(c.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
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
                    <Text variant="bodyStrong">{c.code}</Text>
                    <Text variant="small" color="mutedForeground">
                      {c.label}
                    </Text>
                  </View>
                  {active && <Check size={20} color={colors.primary} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
