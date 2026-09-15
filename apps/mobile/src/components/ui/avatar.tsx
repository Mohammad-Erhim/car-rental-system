import { View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.primaryForeground, fontSize: size * 0.4, fontWeight: '700' }}>
        {initialsOf(name) || '?'}
      </Text>
    </View>
  );
}
