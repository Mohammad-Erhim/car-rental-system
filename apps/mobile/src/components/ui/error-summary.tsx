import { AlertTriangle } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { FieldErrorItem } from '../../lib/api/hooks/use-form-errors';
import { useTheme } from '../../lib/theme/theme-provider';

import { Text } from './text';

export interface ErrorSummaryProps {
  items: FieldErrorItem[];
  /** Called once when the summary transitions from empty to non-empty — e.g. to scroll a
   *  surrounding ScrollView to the top. Keyed on `items.length`, not array identity: a memory
   *  from the web app's ErrorSummary (PR #6) is that keying this on identity re-fires on every
   *  render of a re-created-but-equal array and steals focus/scroll out from under the user
   *  mid-correction — count is the stable signal for "did the error set actually change". */
  onAppear?: () => void;
}

export function ErrorSummary({ items, onAppear }: ErrorSummaryProps) {
  const { colors, radius, space } = useTheme();
  const prevCount = useRef(0);

  useEffect(() => {
    if (prevCount.current === 0 && items.length > 0) onAppear?.();
    prevCount.current = items.length;
  }, [items.length, onAppear]);

  if (!items.length) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: space(2),
        backgroundColor: colors.destructive + '1A',
        borderColor: colors.destructive,
        borderWidth: 1,
        borderRadius: radius,
        padding: space(3),
      }}
    >
      <AlertTriangle size={18} color={colors.destructive} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: space(1) }}>
        {items.map((item) => (
          <Text key={item.id} variant="small" color="destructive">
            {item.message}
          </Text>
        ))}
      </View>
    </View>
  );
}
