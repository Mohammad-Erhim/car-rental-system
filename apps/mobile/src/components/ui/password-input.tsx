import { useI18n } from '@carrental/i18n/react';
import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Pressable } from 'react-native';

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
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? t('auth.hidePw') : t('auth.showPw')}
          >
            {visible ? (
              <EyeOff size={20} color={colors.mutedForeground} />
            ) : (
              <Eye size={20} color={colors.mutedForeground} />
            )}
          </Pressable>
        }
        {...props}
      />
    );
  },
);
