import { useI18n } from '@carrental/i18n/react';
import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { Input, type InputProps } from './input';

/**
 * A password field with a show/hide toggle. RTL-safe by construction — the eye icon is passed as
 * `rightIcon`, which `<Input>` places in reading-order position via `flexDirection: 'row'`, RN's
 * own I18nManager-aware row-reversal in RTL (no manual left/right flip needed, unlike the web
 * fix in PR #10 which had to special-case CSS `insetInlineEnd`).
 */
export const PasswordInput = forwardRef<TextInput, Omit<InputProps, 'secureTextEntry' | 'rightIcon'>>(
  function PasswordInput(props, ref) {
    const { colors } = useTheme();
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    return (
      <Input
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        rightIcon={
          <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Pressable
              onPress={() => setVisible((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={visible ? t('auth.hidePw') : t('auth.showPw')}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {visible ? (
                <EyeOff size={21} color={colors.mutedForeground} />
              ) : (
                <Eye size={21} color={colors.mutedForeground} />
              )}
            </Pressable>
          </View>
        }
        {...props}
      />
    );
  },
);
