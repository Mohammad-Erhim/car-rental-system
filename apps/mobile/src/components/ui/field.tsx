import { useI18n } from '@carrental/i18n/react';
import type { ReactNode } from 'react';
import { View } from 'react-native';


import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface FieldProps {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string | null;
}

/** Label + control + hint/error — the same composition `packages/ui`'s web `<Field>` uses,
 *  wired to the shared `field.optional` catalogue key instead of a hardcoded "(optional)". */
export function Field({ label, children, required, hint, error }: FieldProps) {
  const { space } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ gap: space(1.5) }}>
      <Text variant="bodyStrong">
        {label}
        {!required && <Text variant="small" color="mutedForeground">{'  '}({t('field.optional')})</Text>}
      </Text>
      {children}
      {error ? (
        <Text variant="small" color="destructive">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="mutedForeground">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
