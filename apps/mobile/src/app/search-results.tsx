import { useI18n } from '@carrental/i18n/react';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';

import { AppStateView, Badge, Card, DirectionalIcon, Screen, Text, errorStateKind } from '../components/ui';
import { CarArt } from '../components/vehicle/car-art';
import { resolveAssetUrl } from '../lib/api/config';
import {
  formatMinor,
  useAvailabilitySearch,
  useCategories,
  useLocations,
  type SearchArgs,
} from '../lib/api/hooks/use-discovery';
import { useCurrencyPreference } from '../lib/currency/currency-store';
import { useTheme } from '../lib/theme/theme-provider';
import { useTripDraft } from '../lib/trip/trip-draft-store';

export default function SearchResultsScreen() {
  const { t, locale } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const draft = useTripDraft();
  const currency = useCurrencyPreference((s) => s.code);
  const categoriesQuery = useCategories(locale);
  const locationsQuery = useLocations();
  const pickupLocationName =
    locationsQuery.data?.find((l) => l.code === draft.pickupLocationCode)?.name ??
    draft.pickupLocationCode ??
    '';

  const args: SearchArgs | null = useMemo(() => {
    if (!draft.pickupLocationCode || !draft.pickupAt || !draft.returnAt) return null;
    return {
      pickupLocationCode: draft.pickupLocationCode,
      returnLocationCode: draft.returnLocationCode ?? undefined,
      pickupAt: draft.pickupAt,
      returnAt: draft.returnAt,
      currency: currency ?? undefined,
    };
  }, [
    draft.pickupLocationCode,
    draft.returnLocationCode,
    draft.pickupAt,
    draft.returnAt,
    currency,
  ]);

  const searchQuery = useAvailabilitySearch(args);
  const imageByCategory = new Map((categoriesQuery.data ?? []).map((c) => [c.code, c.imageUrl]));

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: t('site.search.title') }} />
      {!args ? (
        <AppStateView kind="empty" title={t('site.search.noQuery')} />
      ) : searchQuery.isLoading ? (
        <AppStateView kind="loading" />
      ) : searchQuery.isError ? (
        <AppStateView kind={errorStateKind(searchQuery.error)} onRetry={() => searchQuery.refetch()} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, padding: space(4), gap: space(3) }}
          data={searchQuery.data?.options ?? []}
          keyExtractor={(item) => item.categoryCode}
          ListHeaderComponent={
            searchQuery.data ? (
              <View style={{ gap: space(2), marginBottom: space(2) }}>
                <Text variant="small" color="mutedForeground">
                  {t('site.search.summary', { location: pickupLocationName })}
                </Text>
                {searchQuery.data.notices.map((n, i) => (
                  <Badge key={i} tone="warning">
                    {n.message}
                  </Badge>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={<AppStateView kind="no-results" title={t('site.search.noResults')} />}
          renderItem={({ item }) => {
            const imageUrl = imageByCategory.get(item.categoryCode);
            const soldOut = item.bookableCount < 1;
            return (
              <Card
                onPress={() => {
                  draft.setDraft({ categoryCode: item.categoryCode, unitId: null });
                  router.push({
                    pathname: '/vehicles/[categoryCode]',
                    params: { categoryCode: item.categoryCode },
                  });
                }}
                padded={false}
                style={{ overflow: 'hidden' }}
              >
                <View style={{ flexDirection: 'row' }}>
                  <View
                    style={{
                      width: 116,
                      minHeight: 126,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {imageUrl ? (
                      <Image
                        source={{ uri: resolveAssetUrl(imageUrl) }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : (
                      <CarArt code={item.categoryCode} width={104} height={76} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: space(2), padding: space(3.5) }}>
                    <Text variant="bodyStrong">{item.categoryName}</Text>
                    <Text variant="small" color="mutedForeground">
                      {t('site.vehicle.specs', {
                        passengers: item.passengers,
                        luggage: item.luggage,
                        transmission: t(
                          item.transmission === 'manual'
                            ? 'site.vehicle.transmission.manual'
                            : 'site.vehicle.transmission.automatic',
                        ),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
                      {soldOut ? (
                        <XCircle size={14} color={colors.mutedForeground} />
                      ) : (
                        <CheckCircle2 size={14} color={colors.success} />
                      )}
                      <Text variant="small" color={soldOut ? 'mutedForeground' : 'success'}>
                        {t('site.search.available', { n: item.bookableCount })}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        gap: space(2),
                      }}
                    >
                      {item.fromTotalMinor !== null && item.currency ? (
                        <Text variant="bodyStrong">
                          {t('site.search.fromPrice', {
                            price: formatMinor(item.fromTotalMinor, item.currency, locale),
                          })}
                        </Text>
                      ) : (
                        <Text variant="small" color="mutedForeground">
                          {t('site.vehicle.noPrice')}
                        </Text>
                      )}
                      <DirectionalIcon>
                        <ArrowRight size={18} color={colors.primary} />
                      </DirectionalIcon>
                    </View>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}
