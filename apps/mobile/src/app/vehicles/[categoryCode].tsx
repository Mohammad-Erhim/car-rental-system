import { useI18n } from '@carrental/i18n/react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Briefcase, Car, Cog, DoorOpen, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppStateView, Badge, Button, Card, Screen, Text } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import {
  formatMinor,
  useAvailabilitySearch,
  useAvailableUnits,
  useCategory,
  useCreateQuote,
  type SearchArgs,
} from '../../lib/api/hooks/use-discovery';
import { useTheme } from '../../lib/theme/theme-provider';
import { useTripDraft } from '../../lib/trip/trip-draft-store';

export default function VehicleDetailScreen() {
  const { categoryCode } = useLocalSearchParams<{ categoryCode: string }>();
  const { t, locale } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const draft = useTripDraft();
  const toast = useToast();

  const categoryQuery = useCategory(categoryCode ?? null, locale);

  const args: SearchArgs | null = useMemo(() => {
    if (!categoryCode || !draft.pickupLocationCode || !draft.pickupAt || !draft.returnAt) return null;
    return {
      pickupLocationCode: draft.pickupLocationCode,
      returnLocationCode: draft.returnLocationCode ?? undefined,
      pickupAt: draft.pickupAt,
      returnAt: draft.returnAt,
      categoryCode,
    };
  }, [categoryCode, draft.pickupLocationCode, draft.returnLocationCode, draft.pickupAt, draft.returnAt]);

  const priceQuery = useAvailabilitySearch(args);
  const priceOption = priceQuery.data?.options.find((o) => o.categoryCode === categoryCode);

  const unitsQuery = useAvailableUnits(
    categoryCode ?? '',
    args && draft.pickupAt && draft.returnAt
      ? { locationCode: draft.pickupLocationCode!, pickupAt: draft.pickupAt, returnAt: draft.returnAt }
      : null,
  );

  const createQuote = useCreateQuote();
  const [reserving, setReserving] = useState(false);

  if (categoryQuery.isLoading) {
    return (
      <Screen>
        <AppStateView kind="loading" />
      </Screen>
    );
  }
  if (categoryQuery.isError || !categoryQuery.data) {
    return (
      <Screen>
        <AppStateView kind="failure" onRetry={() => categoryQuery.refetch()} />
      </Screen>
    );
  }

  const category = categoryQuery.data;

  const reserve = async () => {
    if (!args) {
      router.push('/search');
      return;
    }
    setReserving(true);
    try {
      const quote = await createQuote.mutateAsync({
        ...args,
        categoryCode: category.code,
        hold: true,
        unitId: draft.unitId ?? undefined,
      });
      draft.setDraft({ categoryCode: category.code });
      router.push({ pathname: '/checkout', params: { reference: quote.reference } });
    } catch {
      toast.show(t('checkout.quoteGone'), 'error');
    } finally {
      setReserving(false);
    }
  };

  return (
    <Screen padded={false} scroll>
      <Stack.Screen options={{ title: category.displayName }} />
      <View style={{ height: 260, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
        {category.imageUrl ? (
          <Image source={{ uri: category.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Car size={64} color={colors.mutedForeground} />
        )}
      </View>

      <View style={{ padding: space(4), gap: space(5) }}>
        <View style={{ gap: space(1) }}>
          <Text variant="caption" color="primary">
            {t('site.vehicle.eyebrow')}
          </Text>
          <Text variant="display">{category.displayName}</Text>
          {category.description ? (
            <Text variant="body" color="mutedForeground">
              {category.description}
            </Text>
          ) : null}
        </View>

        <Card>
          <Text variant="h3" style={{ marginBottom: space(3) }}>
            {t('site.vehicle.specsTitle')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(4) }}>
            <SpecItem icon={<Users size={18} color={colors.primary} />} label={t('site.vehicle.passengers')} value={String(category.passengers)} />
            <SpecItem icon={<Briefcase size={18} color={colors.primary} />} label={t('site.vehicle.luggage')} value={String(category.luggage)} />
            <SpecItem icon={<DoorOpen size={18} color={colors.primary} />} label={t('site.vehicle.doors')} value={String(category.doors)} />
            <SpecItem
              icon={<Cog size={18} color={colors.primary} />}
              label={t('site.vehicle.transmissionLabel')}
              value={t(
                category.transmission === 'manual'
                  ? 'site.vehicle.transmission.manual'
                  : 'site.vehicle.transmission.automatic',
              )}
            />
          </View>
        </Card>

        {category.features.length > 0 && (
          <View style={{ gap: space(2) }}>
            <Text variant="h3">{t('site.vehicle.features')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
              {category.features.map((f) => (
                <Badge key={f.code} tone="neutral">
                  {f.label}
                </Badge>
              ))}
            </View>
          </View>
        )}

        {!args ? (
          <Card>
            <Text variant="body" style={{ marginBottom: space(3) }}>
              {t('site.vehicle.pickTripPrompt')}
            </Text>
            <Button onPress={() => router.push('/search')}>{t('site.vehicle.checkAvailability')}</Button>
          </Card>
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="bodyStrong">{t('site.vehicle.priceForTrip')}</Text>
                <Text variant="small" color="primary" onPress={() => router.push('/search')}>
                  {t('site.vehicle.changeTrip')}
                </Text>
              </View>
              {priceQuery.isLoading ? (
                <AppStateView kind="loading" inline />
              ) : priceOption?.fromTotalMinor != null && priceOption.currency ? (
                <Text variant="display" style={{ marginTop: space(2) }}>
                  {formatMinor(priceOption.fromTotalMinor, priceOption.currency, locale)}
                </Text>
              ) : (
                <Text variant="small" color="mutedForeground" style={{ marginTop: space(2) }}>
                  {t('site.vehicle.noPrice')}
                </Text>
              )}
            </Card>

            {!!unitsQuery.data?.length && (
              <View style={{ gap: space(2) }}>
                <Text variant="h3">{t('site.vehicle.chooseYourCar')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
                  <UnitOption
                    label={t('site.vehicle.anyAvailableCar')}
                    selected={!draft.unitId}
                    onPress={() => draft.setDraft({ unitId: null })}
                  />
                  {unitsQuery.data.map((u) => (
                    <UnitOption
                      key={u.id}
                      label={[u.colour, u.make, u.model].filter(Boolean).join(' ') || u.id}
                      imageUrl={u.imageUrl}
                      selected={draft.unitId === u.id}
                      onPress={() => draft.setDraft({ unitId: u.id })}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            <Button fullWidth size="lg" loading={reserving} onPress={reserve}>
              {t('site.vehicle.reserveContinue')}
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

function SpecItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), minWidth: '40%' }}>
      {icon}
      <View>
        <Text variant="small" color="mutedForeground">
          {label}
        </Text>
        <Text variant="bodyStrong">{value}</Text>
      </View>
    </View>
  );
}

function UnitOption({
  label,
  imageUrl,
  selected,
  onPress,
}: {
  label: string;
  imageUrl?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Card
      onPress={onPress}
      padded={false}
      style={{
        width: 140,
        borderColor: selected ? colors.primary : colors.border,
        borderWidth: selected ? 2 : 1,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 80, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Car size={28} color={colors.mutedForeground} />
        )}
      </View>
      <View style={{ padding: space(2) }}>
        <Text variant="small" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Card>
  );
}
