import type { ColorToken } from '@carrental/theme';
import { View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive';

const TONE_TOKENS: Record<BadgeTone, { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: 'muted', fg: 'mutedForeground' },
  primary: { bg: 'primary', fg: 'primaryForeground' },
  success: { bg: 'success', fg: 'successForeground' },
  warning: { bg: 'warning', fg: 'warningForeground' },
  destructive: { bg: 'destructive', fg: 'destructiveForeground' },
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: string }) {
  const { colors, radius } = useTheme();
  const t = TONE_TOKENS[tone];
  return (
    <View
      style={{
        backgroundColor: colors[t.bg],
        borderRadius: Math.min(radius, 999),
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text variant="caption" style={{ color: colors[t.fg] }}>
        {children}
      </Text>
    </View>
  );
}

/** Reservation/rental state -> badge tone (SCREEN-CUS-017..021 state model). */
export function toneForReservationState(state: string): BadgeTone {
  switch (state) {
    case 'confirmed':
    case 'active':
      return 'success';
    case 'pending':
    case 'modified':
      return 'primary';
    case 'overdue':
    case 'no_show':
      return 'warning';
    case 'cancelled':
      return 'destructive';
    default:
      return 'neutral';
  }
}
