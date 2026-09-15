import { Pressable } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        paddingHorizontal: space(3.5),
        paddingVertical: space(2),
        borderRadius: Math.min(radius * 2, 999),
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.background,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text variant="small" style={{ color: selected ? colors.primaryForeground : colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}
