import { useI18n } from '@carrental/i18n/react';
import { ArrowRight } from 'lucide-react-native';
import { View } from 'react-native';

import { formatMinor } from '../../lib/api/hooks/use-discovery';
import { useTheme } from '../../lib/theme/theme-provider';
import { Badge, Card, Text, toneForReservationState } from '../ui';

export interface TripCardReservation {
  reference: string;
  state: string;
  categoryCode: string;
  pickupLocationCode: string;
  /** `/bookings/mine` (the list endpoint `TripCard` renders) doesn't return this — only the
   *  single-reservation detail endpoint does. */
  returnLocationCode?: string;
  pickupAt: string;
  returnAt: string;
  totalMinor: number;
  currency: string;
}

export function TripCard({ reservation, onPress }: { reservation: TripCardReservation; onPress: () => void }) {
  const { t, locale, fmt } = useI18n();
  const { colors, space } = useTheme();

  return (
    <Card onPress={onPress} style={{ gap: space(2) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="bodyStrong">{reservation.categoryCode}</Text>
        <Badge tone={toneForReservationState(reservation.state)}>
          {t(`reservation.state.${reservation.state}` as 'reservation.state.confirmed')}
        </Badge>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <Text variant="small" color="mutedForeground">
          {reservation.pickupLocationCode}
        </Text>
        {reservation.returnLocationCode ? (
          <>
            <ArrowRight size={12} color={colors.mutedForeground} />
            <Text variant="small" color="mutedForeground">
              {reservation.returnLocationCode}
            </Text>
          </>
        ) : null}
      </View>

      <Text variant="small" color="mutedForeground">
        {fmt.dateTime(reservation.pickupAt)} — {fmt.dateTime(reservation.returnAt)}
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space(1) }}>
        <Text variant="small" color="mutedForeground">
          {reservation.reference}
        </Text>
        <Text variant="bodyStrong">{formatMinor(reservation.totalMinor, reservation.currency, locale)}</Text>
      </View>
    </Card>
  );
}
