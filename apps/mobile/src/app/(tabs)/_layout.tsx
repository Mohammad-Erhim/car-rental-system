import { useI18n } from '@carrental/i18n/react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { CalendarCheck, House, Search, User, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { I18nManager, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/theme-provider';
import { FLOATING_TAB_BAR, withAlpha } from '../../lib/theme/tokens';

const ICONS: Record<string, LucideIcon> = {
  index: House,
  search: Search,
  trips: CalendarCheck,
  account: User,
};

const PILL_WIDTH = 54;
const PILL_HEIGHT = 34;

// LTR only — two bugs found here, only one actually fixed:
//   1. FIXED: the tab bar was remounting on every tab press because `tabBar` was an inline arrow
//      function (new identity every TabsLayout render). Memoized as `renderTabBar` below.
//   2. NOT FIXED, RTL-only: arriving at a tab via the animated (withSpring) path — not the
//      initial snap-in-place on mount, which is unaffected — can land the blob off the right
//      edge of the screen instead of under the icon. Confirmed via logging that the *computed*
//      target x is correct every time (matches the value that renders fine on mount), so this is
//      downstream of that: something in the withSequence/withSpring chain on blobX/stretch, not
//      the RTL index math. Not reliably reproducible on demand (worked for many cycles, then
//      didn't, across fresh reloads), so it wasn't safely fixable in this pass. LTR never showed
//      this, so the indicator stays on there and off only under RTL until someone can attach a
//      profiler to the shared-value updates directly.
const ENABLE_LIQUID_INDICATOR = !I18nManager.isRTL;

/** A single blob that slides between tabs instead of each icon independently toggling a pill —
 *  the "liquid" look is the blob briefly stretching wider along the direction of travel before
 *  snapping back to its destination width, like a drop of liquid dragged sideways.
 *
 *  Deliberately computes each tab's target x arithmetically (equal-width columns) rather than
 *  from a per-tab `onLayout` measurement: `onLayout` reports the *physical* post-RTL-mirror
 *  position, but positioning a sibling view with a raw `left`/`transform` value re-enters RN's
 *  own `left`/`right` auto-swap-under-RTL logic (`I18nManager.doLeftAndRightSwapInRTL`, on by
 *  default) — mixing an already-physical measurement with a property that gets logically
 *  re-mirrored a second time lands the blob on the wrong side (or off-screen entirely). Working
 *  purely from `state.index` and a single measured bar width, mirrored by hand via
 *  `I18nManager.isRTL`, sidesteps that entirely. */
function LiquidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const columnWidth = barWidth / state.routes.length;

  const blobX = useSharedValue(0);
  const stretch = useSharedValue(1);
  const hasMeasured = useRef(false);

  const targetX = (index: number) => {
    const logicalIndex = I18nManager.isRTL ? state.routes.length - 1 - index : index;
    return logicalIndex * columnWidth + (columnWidth - PILL_WIDTH) / 2;
  };

  useEffect(() => {
    if (!ENABLE_LIQUID_INDICATOR || !columnWidth) return;
    const x = targetX(state.index);
    if (!hasMeasured.current) {
      // First measurement (app open / tab bar mount): snap in place, no slide-in from x:0.
      blobX.value = x;
      hasMeasured.current = true;
      return;
    }
    stretch.value = withSequence(
      withTiming(1.35, { duration: 130 }),
      withSpring(1, { damping: 11, stiffness: 170 }),
    );
    blobX.value = withSpring(x, { damping: 16, stiffness: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetX is stable per render, only state.index/columnWidth should retrigger
  }, [state.index, columnWidth]);

  const blobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: blobX.value }, { scaleX: stretch.value }],
  }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
      style={{
        position: 'absolute',
        left: FLOATING_TAB_BAR.horizontalMargin,
        right: FLOATING_TAB_BAR.horizontalMargin,
        bottom: insets.bottom + FLOATING_TAB_BAR.bottomMargin,
        height: FLOATING_TAB_BAR.height,
        borderRadius: FLOATING_TAB_BAR.radius,
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: colors.foreground,
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
      }}
    >
      {ENABLE_LIQUID_INDICATOR && barWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: (FLOATING_TAB_BAR.height - PILL_HEIGHT) / 2,
              left: 0,
              width: PILL_WIDTH,
              height: PILL_HEIGHT,
              borderRadius: 999,
              backgroundColor: withAlpha(colors.primary, 0.12),
            },
            blobStyle,
          ]}
        />
      ) : null}

      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const Icon = ICONS[route.name] ?? House;
        const color = focused ? colors.primary : colors.mutedForeground;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={descriptors[route.key]?.options.title ?? route.name}
            style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  // A stable reference matters here: an inline `(props) => <LiquidTabBar {...props} />` is a new
  // function every render, and the bottom-tabs navigator re-invokes it (and, apparently, remounts
  // what it returns) on every tab switch — resetting LiquidTabBar's own state (barWidth back to 0,
  // hasMeasured back to false) and making the indicator blink out for a frame before it re-measures
  // and snaps back. useCallback keeps the same function identity across renders.
  const renderTabBar = useCallback((props: BottomTabBarProps) => <LiquidTabBar {...props} />, []);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tabs.Screen name="index" options={{ title: t('mobile.tabs.home') }} />
      <Tabs.Screen name="search" options={{ title: t('action.search') }} />
      <Tabs.Screen name="trips" options={{ title: t('nav.myTrips') }} />
      <Tabs.Screen name="account" options={{ title: t('nav.account') }} />
    </Tabs>
  );
}
