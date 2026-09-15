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
  return <RNText style={[typography[variant], { color: colors[color] }, style]} {...props} />;
}
