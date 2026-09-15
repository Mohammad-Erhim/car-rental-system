import { View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
