import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/theme-provider';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  keyboardAvoiding?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

/** The base every screen mounts on: theme background, safe-area edges, optional scroll +
 *  pull-to-refresh + keyboard-avoidance so forms don't need to reinvent this per screen. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'bottom', 'left', 'right'],
  keyboardAvoiding = false,
  onRefresh,
  refreshing = false,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const { colors, space } = useTheme();

  const scrollProps = {
    style: { flex: 1 },
    contentContainerStyle: [padded && { padding: space(4) }, contentContainerStyle],
    keyboardShouldPersistTaps: 'always' as const,
    refreshControl: onRefresh ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
    ) : undefined,
  };

  // `KeyboardAwareScrollView` (unlike RN's own `ScrollView` + `KeyboardAvoidingView` combo, whose
  // 'padding' behavior is a no-op on Android) tracks the native keyboard height on both platforms
  // and scrolls the focused input above it — this is the thing that makes every form usable with
  // the keyboard open, not just visually shifted.
  const body = scroll ? (
    keyboardAvoiding ? (
      <KeyboardAwareScrollView bottomOffset={space(4)} {...scrollProps}>
        {children}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView {...scrollProps}>{children}</ScrollView>
    )
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: space(4) }, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.root, { backgroundColor: colors.background }, style]}
    >
      {!scroll && keyboardAvoiding ? (
        <KeyboardAvoidingView style={{ flex: 1 }}>{body}</KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
