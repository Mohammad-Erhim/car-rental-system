import { CheckCircle2, AlertTriangle, Info } from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export type ToastTone = 'default' | 'success' | 'error';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

/** Lightweight in-app toast — RN has no cross-platform native equivalent (`ToastAndroid` is
 *  Android-only), so this is the one used everywhere: confirmations, background errors, "copied
 *  to clipboard", etc. Mount once at the app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();

  const show = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = `t${++counter.current}`;
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + space(4), gap: space(2), paddingHorizontal: space(4) }}
      >
        {items.map((item) => {
          const Icon = ICONS[item.tone];
          const iconColor =
            item.tone === 'success' ? colors.success : item.tone === 'error' ? colors.destructive : colors.foreground;
          return (
            <Animated.View
              key={item.id}
              entering={FadeInDown}
              exiting={FadeOutUp}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space(2),
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius,
                padding: space(3),
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              <Icon size={18} color={iconColor} />
              <Text variant="small" style={{ flex: 1 }}>
                {item.message}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
