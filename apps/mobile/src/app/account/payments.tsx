import { useI18n } from '@carrental/i18n/react';
import { Stack, useRouter } from 'expo-router';
import { FlatList } from 'react-native';

import { TripCard } from '../../components/trips/trip-card';
import { AppStateView, Screen, Text } from '../../components/ui';
import { useMyReservations } from '../../lib/api/hooks/use-discovery';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';

export default function PaymentsScreen() {
  const { t } = useI18n();
  const { space } = useTheme();
  const router = useRouter();
  const { actor } = useAuth();
  const list = useMyReservations(!!actor);

  return (
    <Screen contentContainerStyle={{ gap: space(4) }}>
      <Stack.Screen options={{ title: t('payments.title') }} />
      <Text variant="body" color="mutedForeground">
        {t('payments.intro')}
      </Text>
      {list.isLoading ? (
        <AppStateView kind="loading" />
      ) : list.isError ? (
        <AppStateView kind="failure" onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <AppStateView kind="empty" title={t('payments.none')} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={list.data}
          keyExtractor={(r) => r.reference}
          contentContainerStyle={{ gap: space(3) }}
          renderItem={({ item }) => <TripCard reservation={item} onPress={() => router.push(`/trips/${item.reference}`)} />}
        />
      )}
    </Screen>
  );
}
