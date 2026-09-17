import type { ReactNode } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
  /** A handful of cards (the home search card, category cards) want to stand out more than the
   *  default hairline-plus-shadow surface — a hero element, not a list row. Kept as a fixed pair
   *  ('raised' = one specific look) rather than free-form shadow props: every earlier attempt at
   *  a one-off shadowOpacity/shadowRadius override only ever changed iOS, since Android's shadow
   *  model reads `elevation` and ignores shadow*, silently doing nothing on Android. */
  elevated?: 'raised';
}

/** A soft shadow, on top of a hairline border, replaces the previous border-only look across
 *  every card in the app (search results, checkout, trip details, …) — a flat bordered panel with
 *  no depth is what makes a screen read as a form instead of a native product. The border stays
 *  (not just the shadow): `card` and `background` are the same white in light mode, so a card
 *  with no border relies entirely on Android's `elevation` shadow to read as a distinct surface,
 *  which is too faint white-on-white to be reliable. Android needs `elevation` (its shadow model
 *  ignores shadowOffset/Radius/Opacity); iOS needs the shadow* properties (it ignores elevation). */
export function Card({ children, onPress, style, padded = true, elevated }: CardProps) {
  const { colors, radius, space } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: padded ? space(4) : 0,
    ...(elevated === 'raised'
      ? Platform.select({
          ios: {
            shadowColor: colors.foreground,
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
          },
          android: { elevation: 6 },
        })
      : Platform.select({
          ios: {
            shadowColor: colors.foreground,
            shadowOpacity: 0.08,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          },
          android: { elevation: 1.5 },
        })),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
