import { useI18n } from '@carrental/i18n/react';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { MapPin, Navigation, Search } from 'lucide-react-native';
import { forwardRef, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useLocations, type Location as RentalLocation } from '../../lib/api/hooks/use-discovery';
import { distanceKm, formatDistanceKm } from '../../lib/geo';
import { useTheme } from '../../lib/theme/theme-provider';
import { AppStateView, Text } from '../ui';

export interface LocationPickerSheetProps {
  onSelect: (location: RentalLocation) => void;
}

/** A searchable bottom-sheet list of pickup/return locations, sorted by distance once the user
 *  opts into location access (`mobile.location.*`) — falls back to alphabetical (the query's own
 *  `orderBy(asc(location.name))`) when denied or ungeocoded. */
export const LocationPickerSheet = forwardRef<BottomSheet, LocationPickerSheetProps>(
  function LocationPickerSheet({ onSelect }, ref) {
    const { colors, space } = useTheme();
    const { t, fmt } = useI18n();
    const locationsQuery = useLocations();
    const [query, setQuery] = useState('');
    const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);
    const [locating, setLocating] = useState(false);

    const requestNearby = async () => {
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }
      } finally {
        setLocating(false);
      }
    };

    const rows = useMemo(() => {
      const list = (locationsQuery.data ?? []).filter((l) =>
        l.name.toLowerCase().includes(query.trim().toLowerCase()),
      );
      if (!origin) return list.map((l) => ({ location: l, distance: null as number | null }));
      const withDistance = list.map((l) => {
        const lat = l.latitude ? Number(l.latitude) : null;
        const lon = l.longitude ? Number(l.longitude) : null;
        const distance =
          lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon)
            ? distanceKm(origin, { lat, lon })
            : null;
        return { location: l, distance };
      });
      return withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }, [locationsQuery.data, query, origin]);

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={['70%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.card }}
      >
        <View style={{ paddingHorizontal: space(4), gap: space(3), flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(2),
              borderWidth: 1,
              borderColor: colors.input,
              borderRadius: 12,
              paddingHorizontal: space(3),
            }}
          >
            <Search size={18} color={colors.mutedForeground} />
            <BottomSheetTextInput
              placeholder={t('search.locationPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              style={{ flex: 1, paddingVertical: 12, color: colors.foreground, fontSize: 15 }}
            />
          </View>

          {!origin && (
            <Pressable
              onPress={requestNearby}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space(2),
                paddingVertical: space(1),
              }}
            >
              <Navigation size={16} color={colors.primary} />
              <Text variant="small" color="primary">
                {locating ? t('state.loading.title') : t('mobile.location.allow')}
              </Text>
            </Pressable>
          )}

          {locationsQuery.isLoading ? (
            <AppStateView kind="loading" inline />
          ) : locationsQuery.isError ? (
            <AppStateView kind="failure" inline onRetry={() => locationsQuery.refetch()} />
          ) : rows.length === 0 ? (
            <AppStateView kind="no-results" inline />
          ) : (
            <BottomSheetScrollView contentContainerStyle={{ paddingBottom: space(6) }}>
              {rows.map((item) => (
                <Pressable
                  key={item.location.id}
                  onPress={() => onSelect(item.location)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space(3),
                    paddingVertical: space(3),
                  }}
                >
                  <MapPin size={18} color={colors.mutedForeground} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {item.location.name}
                  </Text>
                  {item.distance !== null ? (
                    <Text variant="small" color="mutedForeground">
                      {formatDistanceKm(item.distance, fmt.number)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </BottomSheetScrollView>
          )}
        </View>
      </BottomSheet>
    );
  },
);
