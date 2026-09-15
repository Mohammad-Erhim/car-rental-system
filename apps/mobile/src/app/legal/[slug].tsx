import { useI18n } from '@carrental/i18n/react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { AppStateView, Screen, Text } from '../../components/ui';
import { useTheme } from '../../lib/theme/theme-provider';

const SLUGS = ['terms', 'privacy', 'cookies'] as const;
type Slug = (typeof SLUGS)[number];

const COPY: Record<Slug, { title: string; body: string }> = {
  terms: { title: 'site.legal.terms.title', body: 'site.legal.terms.body' },
  privacy: { title: 'site.legal.privacy.title', body: 'site.legal.privacy.body' },
  cookies: { title: 'site.legal.cookies.title', body: 'site.legal.cookies.description' },
};

export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useI18n();
  const { space } = useTheme();
  const entry = SLUGS.includes(slug as Slug) ? COPY[slug as Slug] : null;

  if (!entry) {
    return (
      <Screen>
        <AppStateView kind="empty" />
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={{ gap: space(4) }}>
      <Stack.Screen options={{ title: t(entry.title) }} />
      <Text variant="display">{t(entry.title)}</Text>
      <Text variant="small" color="mutedForeground">
        {t('site.legal.placeholder')}
      </Text>
      <Text variant="body">{t(entry.body)}</Text>
    </Screen>
  );
}
