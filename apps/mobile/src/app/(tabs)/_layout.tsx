import { useI18n } from '@carrental/i18n/react';
import { Tabs } from 'expo-router';
import { CalendarCheck, House, Search, User, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/theme-provider';
import { FLOATING_TAB_BAR, withAlpha } from '../../lib/theme/tokens';

const PILL_SIZE = { width: 54, height: 34 };

/** Icon that pops and grows a soft pill behind it on a spring when its tab becomes focused —
 *  the bar's "cool" bit beyond the floating shape itself, a common pattern in modern tab bars
 *  (Discord, Instagram, ...). A plain `focused` boolean prop would otherwise only support an
 *  instant style swap; driving both the pill and the icon scale off one shared spring value is
 *  what makes the switch feel like a transition rather than a toggle. */
function TabIcon({ Icon, color, focused }: { Icon: LucideIcon; color: string; focused: boolean }) {
  const { colors } = useTheme();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.15 }],
  }));

  return (
    <View style={{ width: PILL_SIZE.width, height: PILL_SIZE.height, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: PILL_SIZE.width,
            height: PILL_SIZE.height,
            borderRadius: 999,
            backgroundColor: withAlpha(colors.primary, 0.12),
          },
          pillStyle,
        ]}
      />
      <Animated.View style={iconStyle}>
        <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
      </Animated.View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          left: FLOATING_TAB_BAR.horizontalMargin,
          right: FLOATING_TAB_BAR.horizontalMargin,
          bottom: insets.bottom + FLOATING_TAB_BAR.bottomMargin,
          height: FLOATING_TAB_BAR.height,
          borderRadius: FLOATING_TAB_BAR.radius,
          borderTopWidth: 0,
          backgroundColor: colors.card,
          shadowColor: '#000',
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        },
        tabBarItemStyle: { height: FLOATING_TAB_BAR.height, alignItems: 'center', justifyContent: 'center' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('mobile.tabs.home'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={House} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('action.search'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Search} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: t('nav.myTrips'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={CalendarCheck} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('nav.account'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={User} color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
