import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
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

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[padded && { padding: space(4) }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
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
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
