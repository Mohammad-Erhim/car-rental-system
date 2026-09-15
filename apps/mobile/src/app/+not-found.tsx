import { useI18n } from '@carrental/i18n/react';
import { Stack, useRouter } from 'expo-router';

import { AppStateView, Screen } from '../components/ui';

export default function NotFoundScreen() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('route.notFound.title') }} />
      <AppStateView
        kind="empty"
        title={t('route.notFound.title')}
        description={t('route.notFound.body')}
        primaryAction={{ label: t('route.goHome'), onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
