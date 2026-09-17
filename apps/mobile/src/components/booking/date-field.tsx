import { useI18n } from '@carrental/i18n/react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';
import { MODAL_SCRIM } from '../../lib/theme/tokens';
import { Button, Field, PickerControl } from '../ui';

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (next: Date) => void;
  minimumDate?: Date;
  required?: boolean;
  error?: string | null;
}

/** Date-only picker (licence expiry, date of birth) — same platform split as `DateTimeField` but
 *  `mode="date"`, one native dialog instead of the date→time chain. */
export function DateField({ label, value, onChange, minimumDate, required, error }: DateFieldProps) {
  const { colors, radius, space } = useTheme();
  const { fmt, t } = useI18n();
  const [iosVisible, setIosVisible] = useState(false);
  const [iosDraft, setIosDraft] = useState(value ?? new Date());

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: value ?? new Date(),
        mode: 'date',
        minimumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(date);
        },
      });
    } else {
      setIosDraft(value ?? new Date());
      setIosVisible(true);
    }
  };

  return (
    <Field label={label} required={required} error={error}>
      <PickerControl
        onPress={openPicker}
        invalid={!!error}
        icon={<Calendar size={18} color={colors.mutedForeground} />}
        label={value ? fmt.date(value) : '—'}
      />

      {Platform.OS === 'ios' && (
        <Modal visible={iosVisible} transparent animationType="slide" onRequestClose={() => setIosVisible(false)}>
          <Pressable style={{ flex: 1, backgroundColor: MODAL_SCRIM }} onPress={() => setIosVisible(false)} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius * 2, borderTopRightRadius: radius * 2, padding: space(4) }}>
            <DateTimePicker value={iosDraft} mode="date" display="spinner" minimumDate={minimumDate} onChange={(_, d) => d && setIosDraft(d)} />
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
