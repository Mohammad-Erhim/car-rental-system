import { useI18n } from '@carrental/i18n/react';
import { Image } from 'expo-image';
import { ArrowRight, Briefcase, Cog, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { resolveAssetUrl } from '../../lib/api/config';
import { useTheme } from '../../lib/theme/theme-provider';
import { withAlpha } from '../../lib/theme/tokens';
import { Card, DirectionalIcon, Text } from '../ui';

import { CarArt } from './car-art';

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
  const { colors, radius, space } = useTheme();
  const { t } = useI18n();
  const transmissionKey =
    vehicle.transmission === 'manual'
      ? 'site.vehicle.transmission.manual'
      : 'site.vehicle.transmission.automatic';

  return (
    <Card
      onPress={onPress}
      padded={false}
      elevated="raised"
      style={{ overflow: 'hidden', width: 260, ...style }}
    >
      <View
        style={{
          height: 150,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'flex-end',
          overflow: 'hidden',
          paddingBottom: space(2),
        }}
      >
        {vehicle.imageUrl ? (
          <Image
            source={{ uri: resolveAssetUrl(vehicle.imageUrl) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        ) : (
          <CarArt code={vehicle.code} width="82%" height={112} />
        )}
        <View
          style={{
            position: 'absolute',
            right: space(3),
            top: space(3),
            borderRadius: Math.min(radius * 2, 999),
            backgroundColor: withAlpha(colors.primaryForeground, 0.2),
            paddingHorizontal: space(2.5),
            paddingVertical: space(1),
          }}
        >
          <Text
            variant="caption"
            style={{ color: colors.primaryForeground, textTransform: 'uppercase' }}
          >
            {vehicle.code}
          </Text>
        </View>
      </View>
      <View style={{ padding: space(4), gap: space(2) }}>
        <Text variant="bodyStrong">{vehicle.displayName}</Text>
        {vehicle.description ? (
          <Text variant="small" color="mutedForeground" numberOfLines={2}>
            {vehicle.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space(3), flexWrap: 'wrap' }}>
          <Spec
            icon={<Users size={14} color={colors.primary} />}
            label={t('site.home.fleet.seatsShort', { n: vehicle.passengers })}
          />
          <Spec
            icon={<Briefcase size={14} color={colors.primary} />}
            label={t('site.home.fleet.bagsShort', { n: vehicle.luggage })}
          />
          <Spec icon={<Cog size={14} color={colors.primary} />} label={t(transmissionKey)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
          <Text variant="small" color="primary">
            {t('site.home.fleet.cta')}
          </Text>
          <DirectionalIcon>
            <ArrowRight size={14} color={colors.primary} />
          </DirectionalIcon>
        </View>
      </View>
    </Card>
  );
}
