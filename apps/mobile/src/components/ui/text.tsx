import { useI18n } from '@carrental/i18n/react';
import type { ColorToken } from '@carrental/theme';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';
import { typography, type TypographyKey } from '../../lib/theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypographyKey;
  color?: ColorToken;
}

/** The one `<Text>` every screen uses — theme-token color, no literal colors in components
 *  (CLAUDE.md's theming rule, enforced on web by `verify:theme`; there's no RN equivalent lint
 *  yet, so this is the disciplined default instead). */
export function Text({ variant = 'body', color = 'foreground', style, ...props }: TextProps) {
  const { colors } = useTheme();
  const { direction } = useI18n();

  return (
    <RNText
      style={[
        typography[variant],
        {
          color: colors[color],
          // RN 0.74's iOS TextKit renderer leaves `textAlign: auto` physically left-aligned
          // even when the Yoga/UI hierarchy is RTL. In this RN version explicit left/right
          // values are logical and automatically swapped by I18nManager, so `left` means the
          // reading-start edge: physical left in LTR and physical right in RTL. A caller's style
          // remains last so centered or content-specific text can intentionally override this.
          textAlign: 'left',
          writingDirection: direction,
        },
        style,
      ]}
      {...props}
    />
  );
}
