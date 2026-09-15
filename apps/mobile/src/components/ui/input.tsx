import { forwardRef, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

export interface InputProps extends TextInputProps {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { invalid, leftIcon, rightIcon, style, ...props },
  ref,
) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: invalid ? colors.destructive : colors.input,
        borderRadius: radius,
        backgroundColor: colors.background,
        paddingHorizontal: space(3),
        minHeight: 48,
        gap: space(2),
      }}
    >
      {leftIcon}
      <TextInput
        ref={ref}
        style={[{ flex: 1, color: colors.foreground, fontSize: 15, paddingVertical: 10 }, style]}
        placeholderTextColor={colors.mutedForeground}
        {...props}
      />
      {rightIcon}
    </View>
  );
});
