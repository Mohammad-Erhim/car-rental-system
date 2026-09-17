import { useI18n } from '@carrental/i18n/react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { MapPin, Search } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { useLocations, type Location as RentalLocation } from '../../lib/api/hooks/use-discovery';
import { useTheme } from '../../lib/theme/theme-provider';
import { useTripDraft } from '../../lib/trip/trip-draft-store';
import { Button, Card, Field, Text } from '../ui';

import { DateTimeField } from './date-time-field';
import { LocationPickerSheet } from './location-picker-sheet';

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000);
}

function defaultPickup(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return addHours(d, 24);
}

/** The pickup/return location + date-time card driving search everywhere it appears (Home,
 *  Search tab). Reads/writes the persisted trip draft so a search started on Home survives
 *  navigation, sign-in detours, and app restarts (mirrors `apps/site`'s trip-context memory). */
export function TripSearchCard() {
  const { space, colors, radius } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const draft = useTripDraft();
  const locationsQuery = useLocations();
  const pickupSheet = useRef<BottomSheetModal>(null);

  const pickupAt = useMemo(
    () => (draft.pickupAt ? new Date(draft.pickupAt) : defaultPickup()),
    [draft.pickupAt],
  );
  const returnAt = useMemo(
    () => (draft.returnAt ? new Date(draft.returnAt) : addHours(pickupAt, 72)),
    [draft.returnAt, pickupAt],
  );

  const pickupLocation = locationsQuery.data?.find((l) => l.code === draft.pickupLocationCode);

  const selectPickup = (loc: RentalLocation) => {
    draft.setDraft({ pickupLocationCode: loc.code });
    pickupSheet.current?.dismiss();
  };

  const canSearch = !!draft.pickupLocationCode && returnAt > pickupAt;

  // Return-to-a-different-location is hidden from the UI for now: the backend has no one-way-fee
  // calculation wired up (see `one_way_route`/`one_way_fee` in the pricing schema — defined but
  // never read by `quote.calculator.ts`), so letting a guest pick a different drop-off today would
  // silently charge the same price as a same-location return. `returnLocationCode` stays null,
  // which `discovery.controller.ts` already treats as "same as pickup".
  const submit = () => {
    draft.setDraft({
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      returnLocationCode: null,
    });
    router.push('/search-results');
  };

  return (
    <Card
      style={{
        gap: space(4),
        borderRadius: 22,
        shadowColor: colors.foreground,
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <View style={{ gap: space(1) }}>
        <Text
          variant="caption"
          color="primary"
          style={{ textTransform: 'uppercase', letterSpacing: 2 }}
        >
          {t('site.search.heroEyebrow')}
        </Text>
        <Text variant="h2">{t('site.home.searchCardTitle')}</Text>
      </View>

      <Field label={t('mobile.picker.pickupLocation')} required>
        <Pressable
          onPress={() => pickupSheet.current?.present()}
          accessibilityRole="button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space(2),
            borderWidth: 1,
            borderColor: colors.input,
            borderRadius: radius,
            paddingHorizontal: space(3),
            minHeight: 48,
          }}
        >
          <MapPin size={18} color={colors.mutedForeground} />
          <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
            {pickupLocation?.name ?? t('search.locationPlaceholder')}
          </Text>
        </Pressable>
      </Field>

      <DateTimeField
        label={t('search.pickupAt')}
        value={pickupAt}
        minimumDate={new Date()}
        onChange={(d) => draft.setDraft({ pickupAt: d.toISOString() })}
      />
      <DateTimeField
        label={t('search.returnAt')}
        value={returnAt}
        minimumDate={pickupAt}
        onChange={(d) => draft.setDraft({ returnAt: d.toISOString() })}
      />

      <Button
        fullWidth
        size="lg"
        disabled={!canSearch}
        icon={<Search size={18} color={colors.primaryForeground} />}
        onPress={submit}
      >
        {t('action.search')}
      </Button>

      <LocationPickerSheet ref={pickupSheet} onSelect={selectPickup} />
    </Card>
  );
}
