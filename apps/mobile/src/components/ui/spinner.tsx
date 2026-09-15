import { ActivityIndicator } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

export function Spinner({ size = 'small' as 'small' | 'large' }) {
  const { colors } = useTheme();
  return <ActivityIndicator size={size} color={colors.primary} />;
}
