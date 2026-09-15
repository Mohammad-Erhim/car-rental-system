import { useI18n } from '@carrental/i18n/react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';
import { MODAL_SCRIM } from '../../lib/theme/tokens';
import { Button, Field, Text } from '../ui';

export interface DateTimeFieldProps {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  minimumDate?: Date;
  error?: string | null;
}

/**
 * A pickup/return date+time field. Android's native picker only does one mode at a time, so
 * tapping opens the date dialog then chains straight into the time dialog (the platform-standard
 * two-step flow); iOS gets a single inline spinner for both, presented in a bottom sheet-style
 * modal since `datetime` mode isn't split there.
 */
export function DateTimeField({ label, value, onChange, minimumDate, error }: DateTimeFieldProps) {
  const { colors, radius, space } = useTheme();
  const { fmt, t } = useI18n();
  const [iosVisible, setIosVisible] = useState(false);
  const [iosDraft, setIosDraft] = useState(value);

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate,
        onChange: (event, date) => {
          if (event.type !== 'set' || !date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            onChange: (timeEvent, time) => {
              if (timeEvent.type !== 'set' || !time) return;
              const combined = new Date(date);
              combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(combined);
            },
          });
        },
      });
    } else {
      setIosDraft(value);
      setIosVisible(true);
    }
  };

  return (
    <Field label={label} required error={error}>
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space(2),
          borderWidth: 1,
          borderColor: error ? colors.destructive : colors.input,
          borderRadius: radius,
          paddingHorizontal: space(3),
          minHeight: 48,
        }}
      >
        <Calendar size={18} color={colors.mutedForeground} />
        <Text variant="body">{fmt.dateTime(value)}</Text>
      </Pressable>

      {Platform.OS === 'ios' && (
        <Modal visible={iosVisible} transparent animationType="slide" onRequestClose={() => setIosVisible(false)}>
          <Pressable style={{ flex: 1, backgroundColor: MODAL_SCRIM }} onPress={() => setIosVisible(false)} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius * 2, borderTopRightRadius: radius * 2, padding: space(4) }}>
            <DateTimePicker
              value={iosDraft}
              mode="datetime"
              display="spinner"
              minimumDate={minimumDate}
              onChange={(_, d) => d && setIosDraft(d)}
            />
            <Button
              fullWidth
              onPress={() => {
                onChange(iosDraft);
                setIosVisible(false);
              }}
            >
              {t('mobile.picker.done')}
            </Button>
          </View>
        </Modal>
      )}
    </Field>
  );
}
