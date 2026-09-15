import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppStateView, Badge, Button, Card, Text } from '../../components/ui';
import { formatMinor, type ReservationResult } from '../../lib/api/hooks/use-discovery';
import { useTheme } from '../../lib/theme/theme-provider';

export function CheckoutConfirmation({ result, authed }: { result: ReservationResult; authed: boolean }) {
  const { t, locale, fmt } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();

  const carLabel = result.pickedUnit
    ? [
        [result.pickedUnit.make, result.pickedUnit.model].filter(Boolean).join(' '),
        result.pickedUnit.colour ? `(${result.pickedUnit.colour})` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;

  return (
    <View style={{ gap: space(5) }}>
      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), flexWrap: 'wrap' }}>
          <Text variant="h2">{t('checkout.confirmedTitle')}</Text>
          <Badge tone="success">{t(`reservation.state.${result.state}` as 'reservation.state.confirmed')}</Badge>
        </View>

        <Text variant="body">
          {t('checkout.referenceLabel')} <Text variant="bodyStrong">{result.reference}</Text>
        </Text>

        {carLabel ? <Text variant="body">{t('checkout.yourCar', { car: carLabel })}</Text> : null}

        <View style={{ gap: space(1), paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.border }}>
          {result.lines.map((l) => (
            <View key={l.code} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small" color="mutedForeground">
                {l.label}
              </Text>
              <Text variant="small">{formatMinor(l.amountMinor, result.currency, locale)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space(1) }}>
            <Text variant="bodyStrong">
              {t('checkout.chargedTo', { brand: result.payment.brand ?? 'card', last4: result.payment.last4 ?? '••••' })}
            </Text>
            <Text variant="bodyStrong">{formatMinor(result.totalMinor, result.currency, locale)}</Text>
          </View>
        </View>

        {result.termsAccepted ? (
          <Text variant="caption" color="mutedForeground">
            {t('checkout.termsAcceptedAt', {
              version: result.termsAccepted.version,
              datetime: fmt.dateTime(result.termsAccepted.acceptedAt),
            })}
          </Text>
        ) : null}
      </Card>

      {!authed && result.guestAccessToken ? (
        <AppStateView kind="empty" inline title={t('checkout.bookedAsGuest')} description={t('checkout.bookedAsGuestHint')} />
      ) : null}

      <View style={{ gap: space(2) }}>
        <Button fullWidth size="lg" onPress={() => router.replace(`/trips/${result.reference}`)}>
          {t('checkout.viewMyTrips')}
        </Button>
        <Button fullWidth variant="outline" onPress={() => router.replace('/search')}>
          {t('checkout.startNewSearch')}
        </Button>
      </View>
    </View>
  );
}
