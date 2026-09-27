import { useI18n } from '@carrental/i18n/react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Briefcase, Car, ChevronLeft, Cog, DoorOpen, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  AppStateView,
  Badge,
  Button,
  Card,
  DirectionalIcon,
  Screen,
  Text,
  errorStateKind,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { CarArt } from '../../components/vehicle/car-art';
import { resolveAssetUrl } from '../../lib/api/config';
import {
  formatMinor,
  useAvailabilitySearch,
  useAvailableUnits,
  useCategory,
  useCreateQuote,
  type SearchArgs,
} from '../../lib/api/hooks/use-discovery';
import { guestId } from '../../lib/guest-id';
import { useCurrencyPreference } from '../../lib/currency/currency-store';
import { useTheme } from '../../lib/theme/theme-provider';
import { withAlpha } from '../../lib/theme/tokens';
import { useTripDraft } from '../../lib/trip/trip-draft-store';

export default function VehicleDetailScreen() {
  const { categoryCode } = useLocalSearchParams<{ categoryCode: string }>();
  const { t, locale } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const draft = useTripDraft();
  const currency = useCurrencyPreference((s) => s.code);
  const toast = useToast();

  const categoryQuery = useCategory(categoryCode ?? null, locale);

  const args: SearchArgs | null = useMemo(() => {
    if (!categoryCode || !draft.pickupLocationCode || !draft.pickupAt || !draft.returnAt)
      return null;
    return {
      pickupLocationCode: draft.pickupLocationCode,
      returnLocationCode: draft.returnLocationCode ?? undefined,
      pickupAt: draft.pickupAt,
      returnAt: draft.returnAt,
      categoryCode,
      currency: currency ?? undefined,
    };
  }, [
    categoryCode,
    draft.pickupLocationCode,
    draft.returnLocationCode,
    draft.pickupAt,
    draft.returnAt,
    currency,
  ]);

  const priceQuery = useAvailabilitySearch(args);
  const priceOption = priceQuery.data?.options.find((o) => o.categoryCode === categoryCode);

  const unitsQuery = useAvailableUnits(
    categoryCode ?? '',
    args && draft.pickupAt && draft.returnAt
      ? {
          locationCode: draft.pickupLocationCode!,
          pickupAt: draft.pickupAt,
          returnAt: draft.returnAt,
        }
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
        <AppStateView kind={errorStateKind(categoryQuery.error)} onRetry={() => categoryQuery.refetch()} />
      </Screen>
    );
  }

  const category = categoryQuery.data;
  const selectedUnitId = draft.categoryCode === category.code ? draft.unitId : null;

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
        holderKey: await guestId(),
        unitId: selectedUnitId ?? undefined,
      });
      draft.setDraft({ categoryCode: category.code, unitId: selectedUnitId });
      router.push({ pathname: '/checkout', params: { reference: quote.reference } });
    } catch {
      toast.show(t('checkout.quoteGone'), 'error');
    } finally {
      setReserving(false);
    }
  };

  return (
    <Screen padded={false}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      {/* Outside the ScrollView (not inside the hero) so it stays put instead of scrolling away
       *  with the hero image — the one persistent way back off this screen. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('action.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/search'))}
        style={({ pressed }) => [
          {
            position: 'absolute',
            top: space(4),
            left: space(4),
            zIndex: 2,
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            // Opaque `card` + a shadow, not a translucent tint off the hero's own color — this
            // used to sit only over the green hero image, where a near-white translucent circle
            // always had contrast. Now that it stays fixed while the page scrolls behind it, it
            // can end up over the page's own background instead, where that same fill would
            // nearly disappear in light mode. `card` + shadow is the same floating-over-anything
            // treatment the bottom tab bar already uses.
            backgroundColor: colors.card,
            shadowColor: colors.foreground,
            shadowOpacity: 0.16,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <DirectionalIcon>
          <ChevronLeft size={25} color={colors.primary} />
        </DirectionalIcon>
      </Pressable>
      <ScrollView style={{ flex: 1 }}>
        <View
          style={{
            height: 260,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'flex-end',
            overflow: 'hidden',
            paddingBottom: space(4),
          }}
        >
          {category.imageUrl ? (
            <Image
              source={{ uri: resolveAssetUrl(category.imageUrl) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <CarArt code={category.code} width="86%" height={170} />
          )}
          <View
            style={{
              position: 'absolute',
              right: space(4),
              top: space(4),
              borderRadius: 999,
              backgroundColor: withAlpha(colors.primaryForeground, 0.2),
              paddingHorizontal: space(3),
              paddingVertical: space(1.5),
            }}
          >
            <Text
              variant="caption"
              style={{ color: colors.primaryForeground, textTransform: 'uppercase' }}
            >
              {category.class}
            </Text>
          </View>
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
              <SpecItem
                icon={<Users size={18} color={colors.primary} />}
                label={t('site.vehicle.passengers')}
                value={String(category.passengers)}
              />
              <SpecItem
                icon={<Briefcase size={18} color={colors.primary} />}
                label={t('site.vehicle.luggage')}
                value={String(category.luggage)}
              />
              <SpecItem
                icon={<DoorOpen size={18} color={colors.primary} />}
                label={t('site.vehicle.doors')}
                value={String(category.doors)}
              />
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
              <Button onPress={() => router.push('/search')}>
                {t('site.vehicle.checkAvailability')}
              </Button>
            </Card>
          ) : (
            <>
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
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
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    // Same fix as the home screen's fleet strip: no padding here clips each card's
                    // shadow flush against the ScrollView's own viewport (worst on top/bottom, since
                    // that's clipped at every scroll position). Negative margin keeps the row
                    // aligned with "Choose your car" above it instead of shifting inward.
                    contentContainerStyle={{
                      gap: space(2),
                      paddingVertical: space(2),
                      paddingHorizontal: space(2),
                    }}
                    style={{ marginHorizontal: -space(2) }}
                  >
                    <UnitOption
                      label={t('site.vehicle.anyAvailableCar')}
                      selected={!selectedUnitId}
                      onPress={() => draft.setDraft({ categoryCode: category.code, unitId: null })}
                    />
                    {unitsQuery.data.map((u) => (
                      <UnitOption
                        key={u.id}
                        label={[u.colour, u.make, u.model].filter(Boolean).join(' ') || u.id}
                        imageUrl={u.imageUrl}
                        selected={selectedUnitId === u.id}
                        onPress={() =>
                          draft.setDraft({ categoryCode: category.code, unitId: u.id })
                        }
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              <Button
                fullWidth
                size="lg"
                loading={reserving}
                disabled={priceQuery.isLoading || !priceOption || priceOption.bookableCount < 1}
                trailingIcon={
                  <DirectionalIcon>
                    <ArrowRight size={18} color={colors.primaryForeground} />
                  </DirectionalIcon>
                }
                onPress={reserve}
              >
                {t('site.vehicle.reserveContinue')}
              </Button>
            </>
          )}
        </View>
      </ScrollView>
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
      <View
        style={{
          height: 80,
          backgroundColor: colors.muted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: resolveAssetUrl(imageUrl) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
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
