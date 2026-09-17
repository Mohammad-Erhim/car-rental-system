import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { CreditCard, Database, FileQuestion, IdCard, LogOut, MapPin, Settings, User } from 'lucide-react-native';
import { Alert, View } from 'react-native';

import { Avatar, Button, Divider, ListRow, Screen, Text } from '../../components/ui';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';
import { FLOATING_TAB_BAR } from '../../lib/theme/tokens';

export default function AccountScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const { status, actor, signOut } = useAuth();

  if (status !== 'authenticated' || !actor) {
    return (
      <Screen contentContainerStyle={{ gap: space(6), flex: 1, paddingTop: space(16) }}>
        <View style={{ gap: space(2), alignItems: 'center' }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: space(2),
            }}
          >
            <User size={36} color={colors.primary} strokeWidth={1.75} />
          </View>
          <Text variant="h2" style={{ textAlign: 'center' }}>
            {t('nav.account')}
          </Text>
          <Text variant="body" color="mutedForeground" style={{ textAlign: 'center' }}>
            {t('site.auth.signInSub')}
          </Text>
        </View>
        <Button fullWidth size="lg" onPress={() => router.push('/sign-in')}>
          {t('action.signIn')}
        </Button>
        <Button fullWidth variant="outline" onPress={() => router.push('/register')}>
          {t('action.register')}
        </Button>
      </Screen>
    );
  }

  const confirmSignOut = () => {
    Alert.alert(t('action.signOut'), undefined, [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen scroll padded={false} contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR.contentClearance }}>
      <View style={{ padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <Avatar name={actor.displayName} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="h3">{actor.displayName}</Text>
          <Text variant="small" color="mutedForeground">
            {t('account.signedInAs', { name: actor.displayName })}
          </Text>
          {!actor.emailVerified && (
            <Text variant="caption" color="warning">
              {t('account.emailNotVerified')}
            </Text>
          )}
        </View>
      </View>

      <Divider />
      <ListRow
        icon={<User size={20} color={colors.mutedForeground} />}
        label={t('account.section.profile')}
        hint={t('account.section.profileHint')}
        onPress={() => router.push('/account/profile')}
      />
      <ListRow
        icon={<IdCard size={20} color={colors.mutedForeground} />}
        label={t('account.section.drivers')}
        hint={t('account.section.driversHint')}
        onPress={() => router.push('/account/drivers')}
      />
      <ListRow
        icon={<CreditCard size={20} color={colors.mutedForeground} />}
        label={t('account.section.payments')}
        hint={t('account.section.paymentsHint')}
        onPress={() => router.push('/account/payments')}
      />
      <ListRow
        icon={<Database size={20} color={colors.mutedForeground} />}
        label={t('account.section.data')}
        hint={t('account.section.dataHint')}
        onPress={() => router.push('/account/data')}
      />

      <Divider />
      <ListRow icon={<Settings size={20} color={colors.mutedForeground} />} label={t('mobile.settings.title')} onPress={() => router.push('/settings')} />
      <ListRow icon={<MapPin size={20} color={colors.mutedForeground} />} label={t('nav.locations')} onPress={() => router.push('/locations')} />
      <ListRow icon={<FileQuestion size={20} color={colors.mutedForeground} />} label={t('nav.help')} onPress={() => router.push('/help')} />

      <Divider />
      <ListRow icon={<LogOut size={20} color={colors.destructive} />} label={t('action.signOut')} destructive onPress={confirmSignOut} showChevron={false} />
    </Screen>
  );
}
