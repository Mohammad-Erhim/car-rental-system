import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { DateField } from '../../components/booking/date-field';
import { AppStateView, Button, Card, Field, Input, Screen, Text } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useAddDriver, useDrivers, useRemoveDriver } from '../../lib/api/hooks/use-account';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';

export default function DriversScreen() {
  const { t, fmt } = useI18n();
  const { colors, space } = useTheme();
  const { actor } = useAuth();
  const toast = useToast();
  const driversQuery = useDrivers(!!actor);
  const addDriver = useAddDriver();
  const removeDriver = useRemoveDriver();

  const [fullName, setFullName] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceCountry, setLicenceCountry] = useState('');
  const [licenceExpiresOn, setLicenceExpiresOn] = useState<Date | null>(null);

  const save = async () => {
    try {
      await addDriver.mutateAsync({
        role: 'additional',
        fullName: fullName.trim(),
        licenceNumber: licenceNumber || undefined,
        licenceCountry: licenceCountry || undefined,
        licenceExpiresOn: licenceExpiresOn ? licenceExpiresOn.toISOString().slice(0, 10) : undefined,
      });
      setFullName('');
      setLicenceNumber('');
      setLicenceCountry('');
      setLicenceExpiresOn(null);
      toast.show(t('state.success.title'), 'success');
    } catch {
      toast.show(t('error.generic'), 'error');
    }
  };

  const confirmRemove = (id: string) => {
    Alert.alert(t('driver.removeConfirmTitle'), t('driver.removeConfirmBody'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('driver.remove'), style: 'destructive', onPress: () => void removeDriver.mutateAsync(id) },
    ]);
  };

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(5) }}>
      <Stack.Screen options={{ title: t('driver.title') }} />
      <Text variant="body" color="mutedForeground">
        {t('driver.intro')}
      </Text>

      {driversQuery.isLoading ? (
        <AppStateView kind="loading" inline />
      ) : !driversQuery.data?.length ? (
        <AppStateView kind="empty" inline title={t('driver.none')} description={t('driver.noneHint')} />
      ) : (
        <View style={{ gap: space(3) }}>
          <Text variant="h3">{t('driver.savedList')}</Text>
          {driversQuery.data.map((d) => (
            <Card key={d.id} style={{ gap: space(1) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="bodyStrong">{d.fullName}</Text>
                <Pressable onPress={() => confirmRemove(d.id)} hitSlop={8} accessibilityLabel={t('driver.remove')}>
                  <Trash2 size={18} color={colors.destructive} />
                </Pressable>
              </View>
              {d.licenceNumber ? (
                <Text variant="small" color="mutedForeground">
                  {t('driver.licenceLabel', { number: d.licenceNumber })}
                </Text>
              ) : (
                <Text variant="small" color="mutedForeground">
                  {t('driver.noLicence')}
                </Text>
              )}
              {d.licenceExpiresOn ? (
                <Text variant="caption" color="mutedForeground">
                  {t('driver.expires', { date: fmt.date(d.licenceExpiresOn) })}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Card style={{ gap: space(4) }}>
        <Text variant="h3">{t('driver.add')}</Text>
        <Field label={t('driver.fullName')} required>
          <Input value={fullName} onChangeText={setFullName} autoCapitalize="words" />
        </Field>
        <Field label={t('driver.licenceNumber')}>
          <Input value={licenceNumber} onChangeText={setLicenceNumber} autoCapitalize="characters" />
        </Field>
        <Field label={t('driver.issuingCountry')} hint={t('driver.issuingCountryHint')}>
          <Input value={licenceCountry} onChangeText={(v) => setLicenceCountry(v.toUpperCase())} autoCapitalize="characters" maxLength={2} />
        </Field>
        <DateField label={t('driver.licenceExpiry')} value={licenceExpiresOn} onChange={setLicenceExpiresOn} minimumDate={new Date()} />
        <Button fullWidth loading={addDriver.isPending} disabled={!fullName.trim()} onPress={save}>
          {t('driver.save')}
        </Button>
      </Card>
    </Screen>
  );
}
