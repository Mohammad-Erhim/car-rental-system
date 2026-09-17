import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface PickerControlProps {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  invalid?: boolean;
  numberOfLines?: number;
}

/** The tap-to-open-a-native-picker equivalent of `Input` (date, date+time, location pickers) —
 *  same border/background/radius/min-height so a "type it" field and a "pick it" field read as
 *  one family of controls. Previously each picker hand-rolled this and left `backgroundColor`
 *  unset (`Input` sets it to `colors.background`); invisible in light mode where `background`
 *  and `card` are the same white, but `card` is the lighter of the two in dark mode, so a picker
 *  sitting on a card rendered visibly different from a text input right next to it. */
export function PickerControl({ icon, label, onPress, invalid, numberOfLines }: PickerControlProps) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(2),
        borderWidth: 1,
        borderColor: invalid ? colors.destructive : colors.input,
        borderRadius: radius,
        backgroundColor: colors.background,
        paddingHorizontal: space(3),
        minHeight: 48,
      }}
    >
      {icon}
      <Text variant="body" numberOfLines={numberOfLines} style={{ flex: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}
