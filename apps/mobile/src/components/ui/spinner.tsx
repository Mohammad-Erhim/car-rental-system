import { ActivityIndicator } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

export function Spinner({ size = 'small', color }: { size?: 'small' | 'large'; color?: string }) {
  const { colors } = useTheme();
  return <ActivityIndicator size={size} color={color ?? colors.primary} />;
}
