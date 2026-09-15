import { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../lib/theme/theme-provider';

export interface SkeletonProps {
  height?: number;
  width?: DimensionValue;
  radius?: number;
}

/** Shimmering placeholder block — used inside `<AppStateView kind="loading">` and any list that
 *  wants a skeleton matching its final layout instead of a bare spinner. */
export function Skeleton({ height = 16, width = '100%', radius }: SkeletonProps) {
  const { colors, radius: themeRadius } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: radius ?? themeRadius,
          backgroundColor: colors.muted,
        },
        style,
      ]}
    />
  );
}
