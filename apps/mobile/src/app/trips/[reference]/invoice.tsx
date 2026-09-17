import { useI18n } from '@carrental/i18n/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';

import { AppStateView, Badge, Card, Screen, Text } from '../../../components/ui';
import { formatMinor, useReservationInvoices } from '../../../lib/api/hooks';
import { useTheme } from '../../../lib/theme/theme-provider';

export default function InvoiceScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { t, locale, fmt } = useI18n();
  const { colors, space } = useTheme();
  const invoicesQuery = useReservationInvoices(reference ?? null);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: t('invoice.title') }} />
      {invoicesQuery.isLoading ? (
        <AppStateView kind="loading" />
      ) : !invoicesQuery.data?.length ? (
        <AppStateView kind="empty" title={t('invoice.notYetIssued')} description={t('invoice.notYetIssuedHint')} />
      ) : (
        <FlatList
          contentContainerStyle={{ padding: space(4), gap: space(4) }}
          data={invoicesQuery.data}
          keyExtractor={(inv) => inv.number}
          renderItem={({ item: inv }) => (
            <Card style={{ gap: space(3) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="h3">{inv.kind === 'credit_note' ? t('invoice.creditNoteTitle') : t('invoice.title')}</Text>
                <Badge tone="neutral">{inv.number}</Badge>
              </View>
              {inv.previousNumber ? (
                <Text variant="small" color="mutedForeground">
                  {t('invoice.correctsInvoice', { number: inv.previousNumber })}
                </Text>
              ) : null}
              <Text variant="small" color="mutedForeground">
                {fmt.date(inv.issuedAt)}
              </Text>

              <View style={{ gap: 2 }}>
                <Text variant="caption" color="mutedForeground">
                  {t('invoice.billedTo')}
                </Text>
                <Text variant="small">{inv.snapshot.customer.fullName ?? inv.snapshot.customer.email ?? '—'}</Text>
              </View>

              <View style={{ gap: space(1), paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.border }}>
                {inv.snapshot.lines.map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="small" color="mutedForeground">
                      {l.label}
                    </Text>
                    <Text variant="small">{formatMinor(l.amountMinor, inv.currency, locale)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space(1) }}>
                  <Text variant="bodyStrong">{t('checkout.total')}</Text>
                  <Text variant="bodyStrong">{formatMinor(inv.totalMinor, inv.currency, locale)}</Text>
                </View>
              </View>

              <Text variant="caption" color="mutedForeground">
                {t('invoice.taxId', { id: inv.snapshot.org.taxId })}
              </Text>
              <Text variant="caption" color="mutedForeground">
                {t('invoice.footerNote')}
              </Text>
            </Card>
          )}
          ListFooterComponent={
            (invoicesQuery.data?.length ?? 0) > 1 ? (
              <Text variant="caption" color="mutedForeground" style={{ textAlign: 'center' }}>
                {t('invoice.allVersions')}
              </Text>
            ) : null
          }
        />
      )}
    </Screen>
  );
}
