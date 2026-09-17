import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../lib/theme/theme-provider';
import { MODAL_SCRIM } from '../../lib/theme/tokens';

import { Card } from './card';

/**
 * The open/close state machine shared by every modal shell in the app: a 0→1 `progress` value
 * driven by a spring on open (immediate — React's documented "derive state during render"
 * pattern, not a one-render-late effect, is what makes `rendered` true before the entrance spring
 * has anything to animate) and a timing animation on close, unmounting only once that finishes so
 * closing plays as a dismissal instead of a hard cut.
 */
function useModalTransition(visible: boolean): { rendered: boolean; progress: SharedValue<number> } {
  const progress = useSharedValue(0);
  const [rendered, setRendered] = useState(visible);
  const [prevVisible, setPrevVisible] = useState(visible);

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setRendered(true);
  }

  useEffect(() => {
    if (visible) {
      progress.value = withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      progress.value = withTiming(0, { duration: 160 }, (finished) => {
        if (finished) runOnJS(setRendered)(false);
      });
    }
  }, [visible, progress]);

  return { rendered, progress };
}

export interface AppModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  dismissOnBackdropPress?: boolean;
}

/**
 * The centered-card dialog shell — the step-up password prompt and `ConfirmDialog` (which exists
 * specifically because `Alert.alert` renders the OS's own dialog and can't be styled at all)
 * build on this. A backdrop fade plus a spring-scaled card, replacing what was each screen's own
 * flat, instantly-appearing `<Modal>` box.
 */
export function AppModal({ visible, onRequestClose, children, dismissOnBackdropPress = true }: AppModalProps) {
  const { space } = useTheme();
  const { rendered, progress } = useModalTransition(visible);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: MODAL_SCRIM }, backdropStyle]} />
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={dismissOnBackdropPress ? onRequestClose : undefined}
          accessibilityLabel="Dismiss"
        />
        <View style={{ flex: 1, justifyContent: 'center', padding: space(6) }} pointerEvents="box-none">
          <Animated.View style={cardStyle}>
            <Card elevated="raised" style={{ borderRadius: 24, gap: space(4) }}>
              {children}
            </Card>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The bottom-anchored sheet shell — the iOS spinner date/date-time pickers build on this instead
 * of `AppModal`: a picker sliding up from the bottom is the native iOS convention for this kind
 * of control, not a centered popup, so it gets its own shell rather than being forced into the
 * dialog shape. Same fade + spring polish, plus a drag-handle bar (the universal "this sheet can
 * be dismissed" affordance) that the original plain `<Modal>` never had.
 */
export function AppBottomSheetModal({ visible, onRequestClose, children }: Omit<AppModalProps, 'dismissOnBackdropPress'>) {
  const { colors, radius, space } = useTheme();
  const { rendered, progress } = useModalTransition(visible);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 32 }],
  }));

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: MODAL_SCRIM }, backdropStyle]} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onRequestClose} accessibilityLabel="Dismiss" />
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <Animated.View
            style={[
              {
                backgroundColor: colors.card,
                borderTopLeftRadius: radius * 2,
                borderTopRightRadius: radius * 2,
                padding: space(4),
                paddingTop: space(2.5),
                gap: space(3),
                shadowColor: colors.foreground,
                shadowOpacity: 0.12,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: -6 },
                elevation: 12,
              },
              sheetStyle,
            ]}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: 'center',
              }}
            />
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
