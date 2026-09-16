import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { BadgeCheck, Headset, MapPinned, ShieldCheck, Star } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { TripSearchCard } from '../../components/booking/trip-search-card';
import { AppStateView, Screen, Text } from '../../components/ui';
import { CarArt } from '../../components/vehicle/car-art';
import { CategoryCard } from '../../components/vehicle/category-card';
import { useCategories, useLocations } from '../../lib/api/hooks/use-discovery';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';
import { withAlpha } from '../../lib/theme/tokens';

const TRUST_ITEMS = [
  {
    icon: BadgeCheck,
    titleKey: 'site.home.trust.price.title',
    bodyKey: 'site.home.trust.price.text',
  },
  {
    icon: ShieldCheck,
    titleKey: 'site.home.trust.cancel.title',
    bodyKey: 'site.home.trust.cancel.text',
  },
  {
    icon: MapPinned,
    titleKey: 'site.home.trust.locations.title',
    bodyKey: 'site.home.trust.locations.text',
  },
  {
    icon: Headset,
    titleKey: 'site.home.trust.support.title',
    bodyKey: 'site.home.trust.support.text',
  },
] as const;

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { colors, radius, space } = useTheme();
  const router = useRouter();
  const { actor } = useAuth();
  const categoriesQuery = useCategories(locale);
  const locationsQuery = useLocations();

  const firstName = actor?.displayName?.split(' ')[0];

  return (
    <Screen scroll contentContainerStyle={{ gap: space(5), paddingBottom: space(10) }}>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: colors.primary,
          padding: space(4.5),
          overflow: 'hidden',
          gap: space(3),
        }}
      >
        <View style={{ gap: space(2) }}>
          <Text
            variant="caption"
            style={{
              color: colors.primaryForeground,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            {t('site.home.heroEyebrow')}
          </Text>
          <Text variant="display" style={{ color: colors.primaryForeground }}>
            {firstName ? t('mobile.home.greeting', { name: firstName }) : t('site.home.heroTitle')}
          </Text>
          <Text variant="body" style={{ color: withAlpha(colors.primaryForeground, 0.8) }}>
            {t('site.home.heroSubtitle')}
          </Text>
        </View>
        <View style={{ alignItems: 'center', marginTop: -space(1) }}>
          <CarArt code="premium" width="96%" height={128} />
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), flexWrap: 'wrap' }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              size={15}
              color={colors.primaryForeground}
              fill={colors.primaryForeground}
            />
          ))}
          <Text variant="small" style={{ color: withAlpha(colors.primaryForeground, 0.87) }}>
            {t('site.home.heroRating')}
          </Text>
        </View>
      </View>

      <TripSearchCard />

      <View style={{ gap: space(3) }}>
        <SectionHeader
          title={t('site.home.fleet.title')}
          actionLabel={t('site.vehicle.backToFleet')}
          onAction={() => router.push('/search')}
        />
        {categoriesQuery.isLoading ? (
          <AppStateView kind="loading" inline />
        ) : categoriesQuery.isError ? (
          <AppStateView kind="failure" inline onRetry={() => categoriesQuery.refetch()} />
        ) : !categoriesQuery.data?.length ? (
          <AppStateView
            kind="empty"
            inline
            title={t('site.home.fleet.emptyTitle')}
            description={t('site.home.fleet.emptyText')}
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space(3) }}
          >
            {categoriesQuery.data.map((c) => (
              <CategoryCard
                key={c.code}
                vehicle={c}
                onPress={() => router.push(`/vehicles/${c.code}`)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ gap: space(3) }}>
        <SectionHeader
          title={t('site.home.locations.title')}
          actionLabel={t('site.home.locations.cta')}
          onAction={() => router.push('/locations')}
        />
        {!locationsQuery.isLoading && !!locationsQuery.data?.length && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space(2) }}
          >
            {locationsQuery.data.slice(0, 10).map((l) => (
              <LocationPill key={l.id} name={l.name} onPress={() => router.push('/locations')} />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ gap: space(4) }}>
        <Text variant="h2">{t('site.home.why.title')}</Text>
        <View style={{ gap: space(4) }}>
          {TRUST_ITEMS.map((item) => (
            <TrustRow
              key={item.titleKey}
              icon={item.icon}
              title={t(item.titleKey)}
              body={t(item.bodyKey)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: space(3) }}>
        <Text variant="h2">{t('site.home.stats.title')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
          <StatCard value="120+" label={t('site.home.stats.vehicles')} />
          <StatCard value="8" label={t('site.home.stats.locations')} />
          <StatCard value="4.9/5" label={t('site.home.stats.rating')} />
          <StatCard value="30+" label={t('site.home.stats.countries')} />
        </View>
      </View>

      <View
        style={{
          borderRadius: radius * 2,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: space(4),
          gap: space(2),
        }}
      >
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={14} color={colors.primary} fill={colors.primary} />
          ))}
        </View>
        <Text variant="bodyStrong">“{t('site.home.reviews.r1.quote')}”</Text>
        <Text variant="small" color="mutedForeground">
          {t('site.home.reviews.r1.name')} · {t('site.home.reviews.r1.role')}
        </Text>
      </View>
    </Screen>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space(2),
      }}
    >
      <Text variant="h2">{title}</Text>
      <Text variant="small" color="primary" onPress={onAction}>
        {actionLabel}
      </Text>
    </View>
  );
}

function LocationPill({ name, onPress }: { name: string; onPress: () => void }) {
  const { colors, radius, space } = useTheme();
  return (
    <Text
      variant="small"
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Math.min(radius * 2, 999),
        paddingHorizontal: space(3.5),
        paddingVertical: space(2),
        overflow: 'hidden',
      }}
    >
      {name}
    </Text>
  );
}

function TrustRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof BadgeCheck;
  title: string;
  body: string;
}) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space(3) }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.muted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="small" color="mutedForeground">
          {body}
        </Text>
      </View>
    </View>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={{
        width: '47%',
        borderRadius: radius * 2,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: space(4),
        gap: space(1),
      }}
    >
      <Text variant="h2" color="primary">
        {value}
      </Text>
      <Text variant="caption" color="mutedForeground">
        {label}
      </Text>
    </View>
  );
}
