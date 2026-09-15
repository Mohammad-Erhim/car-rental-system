import { Switch, View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, hint, value, onValueChange, disabled }: SwitchRowProps) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space(3),
        paddingVertical: space(2.5),
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="small" color="mutedForeground">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.muted, true: colors.primary }}
        // Fixed white, not a theme token: the Android thumb needs to contrast against a colored
        // *track* (muted or brand primary), not the page background, so it stays white in both
        // themes — the same reasoning as `MODAL_SCRIM`. iOS ignores this prop entirely.
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
