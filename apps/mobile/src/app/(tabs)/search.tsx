import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import { TripSearchCard } from '../../components/booking/trip-search-card';
import { AppStateView, Screen, Text } from '../../components/ui';
import { CategoryCard } from '../../components/vehicle/category-card';
import { useCategories } from '../../lib/api/hooks/use-discovery';
import { useTheme } from '../../lib/theme/theme-provider';

export default function SearchScreen() {
  const { t, locale } = useI18n();
  const { space } = useTheme();
  const router = useRouter();
  const categoriesQuery = useCategories(locale);

  return (
    <Screen contentContainerStyle={{ gap: space(5) }}>
      <FlatList
        style={{ flex: 1 }}
        data={categoriesQuery.data ?? []}
        keyExtractor={(item) => item.code}
        numColumns={1}
        ListHeaderComponent={
          <View style={{ gap: space(5), paddingBottom: space(4) }}>
            <Text variant="h1">{t('site.fleet.metaTitle')}</Text>
            <TripSearchCard />
            <Text variant="h2">{t('site.home.fleet.title')}</Text>
          </View>
        }
        ListEmptyComponent={
          categoriesQuery.isLoading ? (
            <AppStateView kind="loading" />
          ) : categoriesQuery.isError ? (
            <AppStateView kind="failure" onRetry={() => categoriesQuery.refetch()} />
          ) : (
            <AppStateView kind="empty" title={t('site.home.fleet.emptyTitle')} description={t('site.home.fleet.emptyText')} />
          )
        }
        contentContainerStyle={{ gap: space(3) }}
        renderItem={({ item }) => (
          <CategoryCard vehicle={item} onPress={() => router.push(`/vehicles/${item.code}`)} style={{ width: '100%' }} />
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
