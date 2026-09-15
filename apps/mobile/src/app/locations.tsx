import { useI18n } from '@carrental/i18n/react';
import { Stack, useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { FlatList } from 'react-native';

import { AppStateView, Card, Screen, Text } from '../components/ui';
import { useLocations } from '../lib/api/hooks/use-discovery';
import { useTheme } from '../lib/theme/theme-provider';
import { useTripDraft } from '../lib/trip/trip-draft-store';

export default function LocationsScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const draft = useTripDraft();
  const locationsQuery = useLocations();

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: t('site.locations.title') }} />
      {locationsQuery.isLoading ? (
        <AppStateView kind="loading" />
      ) : locationsQuery.isError ? (
        <AppStateView kind="failure" onRetry={() => locationsQuery.refetch()} />
      ) : !locationsQuery.data?.length ? (
        <AppStateView kind="empty" title={t('site.locations.empty')} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
          data={locationsQuery.data}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={
            <Text variant="body" color="mutedForeground" style={{ marginBottom: space(2) }}>
              {t('site.locations.lead')}
            </Text>
          }
          renderItem={({ item }) => (
            <Card
              onPress={() => {
                draft.setDraft({ pickupLocationCode: item.code });
                router.push('/search');
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}
            >
              <MapPin size={20} color={colors.primary} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {item.name}
              </Text>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
