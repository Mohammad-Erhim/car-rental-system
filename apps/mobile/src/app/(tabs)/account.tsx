import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { CreditCard, Database, FileQuestion, IdCard, LogOut, MapPin, Settings, User } from 'lucide-react-native';
import { View } from 'react-native';

import { Avatar, Button, Divider, ListRow, Screen, Text, useConfirm } from '../../components/ui';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';
import { FLOATING_TAB_BAR } from '../../lib/theme/tokens';

export default function AccountScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const { status, actor, signOut } = useAuth();
  const confirm = useConfirm();
  const authenticated = status === 'authenticated' && !!actor;

  const confirmSignOut = async () => {
    const ok = await confirm({
      title: t('action.signOut'),
      confirmLabel: t('action.signOut'),
      cancelLabel: t('action.cancel'),
      destructive: true,
    });
    if (ok) void signOut();
  };

  // Settings, locations, and help need no account at all — previously this whole section only
  // rendered inside the authenticated branch below, so a signed-out visitor lost access to
  // switching theme/language or reading legal pages until they signed in for no functional
  // reason. Shared between both branches instead of only appearing once someone's logged in.
  const generalRows = (
    <>
      <ListRow
        icon={<Settings size={20} color={colors.mutedForeground} />}
        label={t('mobile.settings.title')}
        onPress={() => router.push('/settings')}
      />
      <ListRow
        icon={<MapPin size={20} color={colors.mutedForeground} />}
        label={t('nav.locations')}
        onPress={() => router.push('/locations')}
      />
      <ListRow
        icon={<FileQuestion size={20} color={colors.mutedForeground} />}
        label={t('nav.help')}
        onPress={() => router.push('/help')}
      />
    </>
  );

  if (!authenticated) {
    return (
      <Screen scroll padded={false} contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR.contentClearance }}>
        <View style={{ gap: space(6), padding: space(4), paddingTop: space(12), alignItems: 'center' }}>
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
          <View style={{ gap: space(2), width: '100%' }}>
            <Button fullWidth size="lg" onPress={() => router.push('/sign-in')}>
              {t('action.signIn')}
            </Button>
            <Button fullWidth variant="outline" onPress={() => router.push('/register')}>
              {t('action.register')}
            </Button>
          </View>
        </View>

        <Divider />
        {generalRows}
      </Screen>
    );
  }

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
      {generalRows}

      <Divider />
      <ListRow icon={<LogOut size={20} color={colors.destructive} />} label={t('action.signOut')} destructive onPress={confirmSignOut} showChevron={false} />
    </Screen>
  );
}
