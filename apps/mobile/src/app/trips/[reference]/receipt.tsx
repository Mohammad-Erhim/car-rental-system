import { useI18n } from '@carrental/i18n/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppStateView, Card, Screen, Text } from '../../../components/ui';
import { formatMinor, useReservationDetail } from '../../../lib/api/hooks';
import { useTheme } from '../../../lib/theme/theme-provider';

export default function ReceiptScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { t, locale, fmt } = useI18n();
  const { colors, space } = useTheme();
  const detail = useReservationDetail(reference ?? null);

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
        <AppStateView kind="failure" onRetry={() => detail.refetch()} />
      </Screen>
    );
  }

  const r = detail.data;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('receipt.title') }} />
      <Card style={{ gap: space(3) }}>
        <Text variant="h2">{t('receipt.title')}</Text>
        <Text variant="small" color="mutedForeground">
          {reference}
        </Text>

        <Row label={t('receipt.vehicleClass')} value={r.categoryCode} />
        <Row label={t('receipt.pickupLoc')} value={r.pickupLocationCode} />
        <Row label={t('receipt.returnLoc')} value={r.returnLocationCode} />
        <Row label={t('receipt.dates')} value={`${fmt.dateTime(r.pickupAt)} — ${fmt.dateTime(r.returnAt)}`} />

        <View style={{ gap: space(1), paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.border }}>
          {r.lines.map((l) => (
            <Row key={l.code} label={l.label} value={formatMinor(l.amountMinor, r.currency, locale)} muted />
          ))}
          <Row label={t('checkout.total')} value={formatMinor(r.totalMinor, r.currency, locale)} strong />
        </View>

        <Row label={t('receipt.paid')} value={formatMinor(r.paidMinor, r.currency, locale)} strong />
        {r.refundedMinor > 0 && <Row label={t('receipt.refunded')} value={formatMinor(r.refundedMinor, r.currency, locale)} />}

        {r.paymentBrand && r.paymentLast4 ? (
          <Text variant="small" color="mutedForeground">
            {t('receipt.paidWith', { brand: r.paymentBrand, last4: r.paymentLast4 })}
          </Text>
        ) : null}

        <Text variant="caption" color="mutedForeground">
          {t('receipt.footerNote')}
        </Text>
      </Card>
    </Screen>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant={strong ? 'bodyStrong' : 'small'} color={muted ? 'mutedForeground' : 'foreground'}>
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'small'}>{value}</Text>
    </View>
  );
}
