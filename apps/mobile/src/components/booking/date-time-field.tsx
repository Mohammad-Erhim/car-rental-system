import { useI18n } from '@carrental/i18n/react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';
import { AppBottomSheetModal, Button, Field, PickerControl } from '../ui';

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
  const { colors } = useTheme();
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
      <PickerControl
        onPress={openPicker}
        invalid={!!error}
        icon={<Calendar size={18} color={colors.mutedForeground} />}
        label={fmt.dateTime(value)}
      />

      {Platform.OS === 'ios' && (
        <AppBottomSheetModal visible={iosVisible} onRequestClose={() => setIosVisible(false)}>
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
        </AppBottomSheetModal>
      )}
    </Field>
  );
}
