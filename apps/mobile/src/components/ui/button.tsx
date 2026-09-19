import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Spinner } from './spinner';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children: string;
  /** A plain style override (not `PressableProps`' pressed-state style function). */
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 46, lg: 54 };
const PAD_X: Record<ButtonSize, number> = { sm: 12, md: 16, lg: 20 };

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    fullWidth,
    icon,
    trailingIcon,
    children,
    disabled,
    style,
    ...props
  },
  ref,
) {
  const { colors, radius } = useTheme();
  const isDisabled = disabled || loading;

  const palette = (() => {
    switch (variant) {
      case 'primary':
        return { bg: colors.primary, fg: colors.primaryForeground, border: 'transparent' };
      case 'secondary':
        return { bg: colors.secondary, fg: colors.secondaryForeground, border: 'transparent' };
      case 'destructive':
        return { bg: colors.destructive, fg: colors.destructiveForeground, border: 'transparent' };
      case 'outline':
        return { bg: 'transparent', fg: colors.foreground, border: colors.border };
      case 'ghost':
        return { bg: 'transparent', fg: colors.foreground, border: 'transparent' };
    }
  })();

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PAD_X[size],
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderRadius: radius,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <Spinner color={palette.fg} />
      ) : (
        <>
          {icon}
          <Text variant="button" style={{ color: palette.fg }} numberOfLines={1} accessible={false}>
            {children}
          </Text>
          {trailingIcon}
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
