import { useEffect } from 'react';
import { Modal, StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../lib/theme/theme-provider';

const GREEN = '#0f6b4c';
const CAR_ASSET = require('../../../assets/splash-car.png');
const GLOW_SIZE = 560;
// Matches the native splash image's own car size exactly: that asset is an 1080×1080 square
// rendered via `resizeMode: 'contain'` on this density, where the car is 50% of the canvas width
// — 540 physical px, i.e. ~206dp. Starting this component's car at any other size is what caused
// the "animation starts large" jump: the native splash hides showing one size, and this took over
// showing a visibly different one in the same instant.
const CAR_WIDTH_DP = 206;
const CAR_HEIGHT_DP = 126;

/**
 * The native splash (app.config.ts's `splash.image`) is a single static frame showing the same
 * car + glow + wordmark composited into one image — an OS-level constraint means it can never
 * itself animate. This component is mounted the entire time that native frame is up (as soon as
 * `RootNavigator` mounts, well before fonts/i18n/theme are ready), rendering that *exact same*
 * look at rest — so there is nothing to "reveal" or fade in when the native splash disappears,
 * no gap, no size jump, just a continuous frame. Only once `active` turns true (native splash
 * confirmed hidden via `SplashScreen.hideAsync()`'s own promise) does it play a subtle bounce/
 * glow-pulse on top of that already-correct frame, then fades the whole thing out to reveal the
 * real app underneath (already mounted and rendered this whole time).
 *
 * Rendered through `Modal` rather than an absolutely-positioned sibling View: an earlier attempt
 * used `StyleSheet.absoluteFillObject` + a high `zIndex`/`elevation` alongside the already-mounted
 * `Stack` navigator, and on Android that combination doesn't reliably establish a true full-screen
 * top layer — the overlay came out short of the real window height. `Modal` renders in its own
 * native window, guaranteed full-screen and always topmost — the same approach
 * `LanguageRestartModal` already uses successfully for exactly this reason.
 */
export function AnimatedSplashScreen({ active, onFinish }: { active: boolean; onFinish: () => void }) {
  const { colors } = useTheme();

  // Resting values already match the native splash's static frame exactly — nothing here fades
  // in from invisible/undersized; `active` only adds a small amount of extra motion on top.
  const carScale = useSharedValue(1);
  const glowOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    if (!active) return;

    carScale.value = withSequence(
      withTiming(1.08, { duration: 180 }),
      withSpring(1, { damping: 9, stiffness: 150, mass: 0.7 }),
    );
    glowOpacity.value = withSequence(withTiming(0.65, { duration: 260 }), withTiming(1, { duration: 380 }));

    const holdMs = 1000;
    const timer = setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    }, holdMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot entrance sequence once `active` flips, deliberately not re-triggered by other value changes
  }, [active]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const carStyle = useAnimatedStyle(() => ({ transform: [{ scale: carScale.value }] }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <Animated.View style={[styles.overlay, { backgroundColor: colors.background }, overlayStyle]}>
        <Animated.View style={[styles.glow, glowStyle]}>
          <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={GREEN} stopOpacity={0.26} />
                <Stop offset="100%" stopColor={GREEN} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={GLOW_SIZE} height={GLOW_SIZE} fill="url(#glow)" />
          </Svg>
        </Animated.View>

        <Animated.Image source={CAR_ASSET} style={[styles.car, carStyle]} resizeMode="contain" />

        <Animated.Text style={[styles.title, { color: colors.foreground }]}>Car Rental</Animated.Text>
        <Animated.Text style={[styles.subtitle, { color: colors.mutedForeground }]}>DONE RIGHT</Animated.Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: { position: 'absolute' },
  car: { width: CAR_WIDTH_DP, height: CAR_HEIGHT_DP },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginTop: 22, letterSpacing: 0.5 },
  subtitle: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 5, letterSpacing: 3 },
});
