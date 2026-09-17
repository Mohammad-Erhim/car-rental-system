import type { ReactElement } from 'react';
import { I18nManager, View } from 'react-native';

/**
 * Wraps a "forward"/"back" lucide icon (ArrowRight, ChevronRight, ChevronLeft, ...) so it mirrors
 * under RTL layout — forward points right in LTR and left in RTL, and vice versa for back. The
 * same `scaleX` flip covers both, since flipping either direction's default orientation lands on
 * the other's.
 *
 * Deliberately a View wrapper rather than `style={{ transform }}` passed to the icon directly:
 * lucide-react-native spreads any prop it doesn't recognize (including `style`) onto every inner
 * SVG element, not just the icon's root — a transform placed there mirrors the path in its own
 * local viewBox space and can push it outside the drawable area, rendering nothing.
 */
export function DirectionalIcon({ children }: { children: ReactElement }) {
  return <View style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}>{children}</View>;
}
