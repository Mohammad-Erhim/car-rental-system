import { Pressable, View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.muted,
        borderRadius: radius,
        padding: 3,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              paddingVertical: space(2),
              borderRadius: Math.max(radius - 3, 0),
              backgroundColor: active ? colors.card : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text variant="small" style={{ fontWeight: '600', color: active ? colors.foreground : colors.mutedForeground }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
