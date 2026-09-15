import { useI18n } from '@carrental/i18n/react';
import { Image } from 'expo-image';
import { Briefcase, Car, Cog, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';
import { Card, Text } from '../ui';

export interface CategoryCardVehicle {
  code: string;
  displayName: string;
  description?: string | null;
  passengers: number;
  luggage: number;
  transmission: string;
  imageUrl?: string | null;
}

function Spec({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {icon}
      <Text variant="caption" color="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

export interface CategoryCardProps {
  vehicle: CategoryCardVehicle;
  onPress: () => void;
  /** Default: a fixed 260px card for horizontal strips. Pass `{ width: '100%' }` in a vertical
   *  full-width list (e.g. the Search tab's browse-fleet grid). */
  style?: ViewStyle;
}

export function CategoryCard({ vehicle, onPress, style }: CategoryCardProps) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const transmissionKey =
    vehicle.transmission === 'manual' ? 'site.vehicle.transmission.manual' : 'site.vehicle.transmission.automatic';

  return (
    <Card onPress={onPress} padded={false} style={{ overflow: 'hidden', width: 260, ...style }}>
      <View style={{ height: 140, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
        {vehicle.imageUrl ? (
          <Image source={{ uri: vehicle.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Car size={48} color={colors.mutedForeground} />
        )}
      </View>
      <View style={{ padding: space(4), gap: space(2) }}>
        <Text variant="bodyStrong">{vehicle.displayName}</Text>
        <View style={{ flexDirection: 'row', gap: space(3), flexWrap: 'wrap' }}>
          <Spec icon={<Users size={14} color={colors.mutedForeground} />} label={t('site.home.fleet.seatsShort', { n: vehicle.passengers })} />
          <Spec icon={<Briefcase size={14} color={colors.mutedForeground} />} label={t('site.home.fleet.bagsShort', { n: vehicle.luggage })} />
          <Spec icon={<Cog size={14} color={colors.mutedForeground} />} label={t(transmissionKey)} />
        </View>
        <Text variant="small" color="primary">
          {t('site.home.fleet.cta')}
        </Text>
      </View>
    </Card>
  );
}
