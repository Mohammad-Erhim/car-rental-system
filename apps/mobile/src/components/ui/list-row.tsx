import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface ListRowProps {
  icon?: ReactNode;
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: ReactNode;
  showChevron?: boolean;
}

/** A settings/account row: icon + label(+hint) + trailing value/control/chevron. The workhorse
 *  of the Account and Settings screens. */
export function ListRow({
  icon,
  label,
  hint,
  value,
  onPress,
  destructive,
  trailing,
  showChevron = !!onPress,
}: ListRowProps) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space(3),
          paddingVertical: space(3),
          paddingHorizontal: space(4),
          backgroundColor: pressed && onPress ? colors.muted : 'transparent',
        },
      ]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text variant="body" color={destructive ? 'destructive' : 'foreground'}>
          {label}
        </Text>
        {hint ? (
          <Text variant="small" color="mutedForeground">
            {hint}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" color="mutedForeground">
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRight size={18} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}
