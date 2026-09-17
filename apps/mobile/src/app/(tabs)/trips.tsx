import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { TripCard } from '../../components/trips/trip-card';
import { AppStateView, Screen, SegmentedControl, Text } from '../../components/ui';
import { useMyReservations } from '../../lib/api/hooks/use-discovery';
import { useAuth } from '../../lib/auth/auth-provider';
import { FLOATING_TAB_BAR } from '../../lib/theme/tokens';

type Segment = 'upcoming' | 'active' | 'past';

export default function TripsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { status } = useAuth();
  const [segment, setSegment] = useState<Segment>('upcoming');
  const reservationsQuery = useMyReservations(status === 'authenticated');

  // Not memoized: grouping by "is pickupAt in the future" has to re-evaluate against the current
  // time on every render anyway (a reservation crosses from upcoming to active/past while the
  // screen just sits open) — memoizing on `reservationsQuery.data` alone would freeze that
  // boundary at whatever moment the data last changed instead of tracking real time. Reading
  // `Date.now()` in render is the deliberate tradeoff that makes that possible; there's no
  // memoization downstream of it for a stale value to leak into.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const list = reservationsQuery.data ?? [];
  const grouped = {
    upcoming: list.filter((r) => ['pending', 'confirmed', 'modified'].includes(r.state) && new Date(r.pickupAt).getTime() >= now),
    active: list.filter((r) => r.state === 'active' || r.state === 'overdue'),
    past: list.filter(
      (r) =>
        ['completed', 'cancelled', 'no_show'].includes(r.state) ||
        (['pending', 'confirmed', 'modified'].includes(r.state) && new Date(r.pickupAt).getTime() < now),
    ),
  };

  if (status !== 'authenticated') {
    return (
      <Screen>
        <AppStateView
          kind="empty"
          title={t('trips.signInPrompt')}
          primaryAction={{ label: t('action.signIn'), onPress: () => router.push('/sign-in') }}
        />
      </Screen>
    );
  }

  const rows = grouped[segment];

  return (
    <Screen contentContainerStyle={{ gap: 16 }}>
      <Text variant="display">{t('trips.title')}</Text>
      <SegmentedControl
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'upcoming', label: t('mobile.trips.upcoming') },
          { value: 'active', label: t('mobile.trips.active') },
          { value: 'past', label: t('mobile.trips.past') },
        ]}
      />
      {reservationsQuery.isLoading ? (
        <AppStateView kind="loading" />
      ) : reservationsQuery.isError ? (
        <AppStateView kind="failure" title={t('trips.loadError')} onRetry={() => reservationsQuery.refetch()} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(r) => r.reference}
          contentContainerStyle={{ gap: 12, paddingBottom: FLOATING_TAB_BAR.contentClearance }}
          refreshing={reservationsQuery.isFetching}
          onRefresh={() => reservationsQuery.refetch()}
          ListEmptyComponent={
            <View style={{ paddingTop: 24 }}>
              <AppStateView
                kind="empty"
                title={t('trips.none')}
                description={t('trips.noneHint')}
                primaryAction={{ label: t('trips.findACar'), onPress: () => router.push('/search') }}
              />
            </View>
          }
          renderItem={({ item }) => <TripCard reservation={item} onPress={() => router.push(`/trips/${item.reference}`)} />}
        />
      )}
    </Screen>
  );
}
