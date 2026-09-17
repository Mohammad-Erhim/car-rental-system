import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { BadgeCheck, Headset, MapPinned, ShieldCheck } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { TripSearchCard } from '../../components/booking/trip-search-card';
import { AppStateView, Screen, Text } from '../../components/ui';
import { CategoryCard } from '../../components/vehicle/category-card';
import { useCategories, useLocations } from '../../lib/api/hooks/use-discovery';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';
import { FLOATING_TAB_BAR, withAlpha } from '../../lib/theme/tokens';

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
  const { colors, space } = useTheme();
  const router = useRouter();
  const { actor } = useAuth();
  const categoriesQuery = useCategories(locale);
  const locationsQuery = useLocations();

  const firstName = actor?.displayName?.split(' ')[0];

  return (
    <Screen scroll contentContainerStyle={{ gap: space(8), paddingBottom: FLOATING_TAB_BAR.contentClearance }}>
      {/* Deliberately compact: the website's hero (title + paragraph + illustration + a full star
          row) took the entire first screen on a short device, pushing the actual search form below
          the fold — a rental app's primary action needs to be reachable without scrolling. No
          rating line here (unlike the site's hero): `site.home.heroRating` is fixed marketing copy
          ("4.9/5 from 12,000+ trips") with no real reviews/ratings system behind it anywhere in the
          backend — same fabricated-data issue as the stats band and customer quote removed
          elsewhere on this screen, just missed here originally since this hero was compacted
          rather than rebuilt from scratch. */}
      <View
        style={{
          borderRadius: 24,
          backgroundColor: colors.primary,
          padding: space(4),
          gap: space(1.5),
        }}
      >
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
        <Text variant="h1" style={{ color: colors.primaryForeground }}>
          {firstName ? t('mobile.home.greeting', { name: firstName }) : t('site.home.heroTitle')}
        </Text>
        <Text
          variant="small"
          numberOfLines={2}
          style={{ color: withAlpha(colors.primaryForeground, 0.85) }}
        >
          {t('site.home.heroSubtitle')}
        </Text>
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
            // CategoryCard's shadow extends past its own bounds — a horizontal ScrollView with no
            // padding clips that shadow flush against its own viewport (most visibly top/bottom,
            // since that's clipped at every scroll position, not just the ends). The vertical
            // padding gives it room; the horizontal padding does the same for the first/last card,
            // offset by a matching negative margin so the row still lines up with the section
            // title above it instead of shifting the whole strip inward.
            contentContainerStyle={{ gap: space(3), paddingVertical: space(3), paddingHorizontal: space(2) }}
            style={{ marginHorizontal: -space(2) }}
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

