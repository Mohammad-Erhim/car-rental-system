import { useI18n } from '@carrental/i18n/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DateTimeField } from '../../../components/booking/date-time-field';
import { AppStateView, Badge, Button, Card, Screen, Text, toneForReservationState, useConfirm } from '../../../components/ui';
import { useToast } from '../../../components/ui/toast';
import {
  formatMinor,
  useCancelReservation,
  useExtendRental,
  useMyRental,
  useReservationDetail,
  useReservationHistory,
} from '../../../lib/api/hooks';
import { useTheme } from '../../../lib/theme/theme-provider';

export default function TripDetailScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { t, locale, fmt } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const detail = useReservationDetail(reference ?? null);
  const history = useReservationHistory(reference ?? null);
  const rental = useMyRental(reference ?? null);
  const cancel = useCancelReservation(reference ?? '');
  const extend = useExtendRental(rental.data?.reference ?? '');

  const [extending, setExtending] = useState(false);
  const [newReturnAt, setNewReturnAt] = useState<Date | null>(null);

  if (detail.isLoading) {
    return (
      <Screen>
        <AppStateView kind="loading" />
      </Screen>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <AppStateView kind="failure" title={t('reservation.loadError')} onRetry={() => detail.refetch()} />
      </Screen>
    );
  }

  const r = detail.data;

  const confirmCancel = async () => {
    const ok = await confirm({
      title: t('reservation.cancelConfirmTitle'),
      body: t('reservation.cancelConfirmBody'),
      confirmLabel: t('reservation.cancelReservation'),
      cancelLabel: t('action.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync({});
      toast.show(t('state.success.title'), 'success');
    } catch {
      toast.show(t('reservation.modifyErr'), 'error');
    }
  };

  const submitExtend = async () => {
    if (!newReturnAt || !rental.data) return;
    try {
      const res = await extend.mutateAsync({ newReturnAt: newReturnAt.toISOString() });
      toast.show(t('reservation.extendOk', { amount: formatMinor(res.deltaMinor, r.currency, locale) }), 'success');
      setExtending(false);
    } catch {
      toast.show(t('reservation.extendErr'), 'error');
    }
  };

  return (
    <Screen scroll contentContainerStyle={{ gap: space(5) }}>
      <Stack.Screen options={{ title: r.reference }} />

      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="h2">{r.categoryCode}</Text>
          <Badge tone={toneForReservationState(r.state)}>{t(`reservation.state.${r.state}` as 'reservation.state.confirmed')}</Badge>
        </View>
        <Text variant="body" color="mutedForeground">
          {r.pickupLocationCode} → {r.returnLocationCode}
        </Text>
        <Text variant="body">
          {fmt.dateTime(r.pickupAt)} — {fmt.dateTime(r.returnAt)}
        </Text>
        {r.pickedUnit ? (
          <Text variant="small" color="mutedForeground">
            {[r.pickedUnit.make, r.pickedUnit.model, r.pickedUnit.colour].filter(Boolean).join(' ')}
          </Text>
        ) : null}
      </Card>

      {rental.data?.state === 'active' && (
        <Card style={{ gap: space(3) }}>
          <Text variant="h3">{t('reservation.rentalIs', { state: t(`reservation.state.${rental.data.state}` as 'reservation.state.active') })}</Text>
          <Text variant="small" color="mutedForeground">
            {t('reservation.dueBack', { datetime: fmt.dateTime(rental.data.scheduledReturnAt) })}
          </Text>
          {extending ? (
            <View style={{ gap: space(3) }}>
              <DateTimeField
                label={t('reservation.newReturn')}
                value={newReturnAt ?? new Date(rental.data.scheduledReturnAt)}
                minimumDate={new Date(rental.data.scheduledReturnAt)}
                onChange={setNewReturnAt}
              />
              <View style={{ flexDirection: 'row', gap: space(2) }}>
                <Button variant="ghost" onPress={() => setExtending(false)}>
                  {t('action.cancel')}
                </Button>
                <Button loading={extend.isPending} onPress={submitExtend}>
                  {t('reservation.extendRental')}
                </Button>
              </View>
            </View>
          ) : (
            <Button variant="outline" onPress={() => setExtending(true)}>
              {t('reservation.extendRental')}
            </Button>
          )}
        </Card>
      )}

      <Card style={{ gap: space(2) }}>
        <Text variant="h3">{t('checkout.total')}</Text>
        {r.lines.map((l) => (
          <View key={l.code} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small" color="mutedForeground">
              {l.label}
            </Text>
            <Text variant="small">{formatMinor(l.amountMinor, r.currency, locale)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text variant="bodyStrong">{t('checkout.total')}</Text>
          <Text variant="bodyStrong">{formatMinor(r.totalMinor, r.currency, locale)}</Text>
        </View>
        {r.refundedMinor > 0 && (
          <Text variant="small" color="mutedForeground">
            {t('reservation.refunded')}: {formatMinor(r.refundedMinor, r.currency, locale)}
          </Text>
        )}
      </Card>

      {r.drivers.length > 0 && (
        <Card style={{ gap: space(1) }}>
          <Text variant="h3" style={{ marginBottom: space(1) }}>
            {t('driver.title')}
          </Text>
          <Text variant="small" color="mutedForeground">
            {t('reservation.drivers', { names: r.drivers.map((d) => d.fullName).join(', ') })}
          </Text>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
        <Button variant="outline" onPress={() => router.push(`/trips/${r.reference}/receipt`)}>
          {t('reservation.viewReceipt')}
        </Button>
        <Button variant="outline" onPress={() => router.push(`/trips/${r.reference}/invoice`)}>
          {t('reservation.viewInvoice')}
        </Button>
      </View>

      {r.cancellable && (
        <Button variant="destructive" loading={cancel.isPending} onPress={confirmCancel}>
          {t('reservation.cancelReservation')}
        </Button>
      )}
      {r.cancellable && (
        <Text variant="caption" color="mutedForeground">
          {t('reservation.cancelPolicy')}
        </Text>
      )}

      {!!history.data?.length && (
        <Card style={{ gap: space(2) }}>
          <Text variant="h3">{t('reservation.history')}</Text>
          {history.data.map((event, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small">{event.type}</Text>
              <Text variant="small" color="mutedForeground">
                {fmt.dateTime(event.at)}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
