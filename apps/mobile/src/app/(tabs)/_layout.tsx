import { useI18n } from '@carrental/i18n/react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { CalendarCheck, House, Search, User, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
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

/** A single blob that slides between tabs instead of each icon independently toggling a pill —
 *  the "liquid" look is the blob briefly stretching wider along the direction of travel before
 *  snapping back to its destination width, like a drop of liquid dragged sideways.
 *
 *  No RTL logic reaches this component's *positioning* math at all — the bar's own row forces
 *  `direction: 'ltr'`, so it never participates in native automatic RTL mirroring, and this
 *  component decides the *visual order* of the tabs itself from `useI18n()`'s `direction` (a
 *  plain JS value that's always in sync with what's on screen). Two earlier approaches both broke
 *  because they mixed a JS computation with the *native* RTL layout direction, which can lag
 *  behind: switching language flips `I18nManager.isRTL` immediately, but the native view tree
 *  only re-lays-out after a full process restart, so a "soft" reload can leave the icons
 *  physically rendered in one order while `I18nManager.isRTL`-based math (or a position cached
 *  from the same stale layout pass) assumes the other. Forcing this row to a fixed literal
 *  direction and choosing tab order ourselves removes the native side from the equation
 *  entirely — there's nothing left for it to disagree with. */
function LiquidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { direction } = useI18n();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const columnWidth = barWidth / state.routes.length;

  // The bar's row is forced to `direction: 'ltr'` below, so this reversal is the *only* thing
  // that decides visual order — plain array order, nothing native to disagree with it.
  const displayRoutes = direction === 'rtl' ? [...state.routes].reverse() : state.routes;
  // `state.index` is always a valid index into `state.routes` per the navigator's own contract.
  const activeRoute = state.routes[state.index]!;
  const activeVisualIndex = displayRoutes.findIndex((r) => r.key === activeRoute.key);

  const blobX = useSharedValue(0);
  const stretch = useSharedValue(1);
  const hasMeasured = useRef(false);

  useEffect(() => {
    if (!columnWidth) return;
    const x = activeVisualIndex * columnWidth + (columnWidth - PILL_WIDTH) / 2;
    if (!hasMeasured.current) {
      // First measurement (app open / tab bar mount): snap in place, no slide-in from x:0.
      blobX.value = x;
      hasMeasured.current = true;
      return;
    }
    stretch.value = withSequence(
      withTiming(1.12, { duration: 110 }),
      withSpring(1, { damping: 22, stiffness: 220 }),
    );
    blobX.value = withSpring(x, { damping: 24, stiffness: 220 });
  }, [activeVisualIndex, columnWidth, blobX, stretch]);

  const blobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: blobX.value }, { scaleX: stretch.value }],
  }));

  return (
    <View
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      style={{
        position: 'absolute',
        left: FLOATING_TAB_BAR.horizontalMargin,
        right: FLOATING_TAB_BAR.horizontalMargin,
        bottom: insets.bottom + FLOATING_TAB_BAR.bottomMargin,
        height: FLOATING_TAB_BAR.height,
        borderRadius: FLOATING_TAB_BAR.radius,
        backgroundColor: colors.card,
        flexDirection: 'row',
        direction: 'ltr',
        alignItems: 'center',
        shadowColor: colors.foreground,
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
      }}
    >
      {barWidth > 0 ? (
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

      {displayRoutes.map((route) => {
        const focused = route.key === activeRoute.key;
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
