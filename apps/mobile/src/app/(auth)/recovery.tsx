import type { ChallengeCreatedResponse } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AppStateView, Button, Card, Field, Input, PasswordInput, Screen, Text } from '../../components/ui';
import { apiFetch } from '../../lib/api/api-fetch';
import { ApiError } from '../../lib/api/query-client';
import { useTheme } from '../../lib/theme/theme-provider';

export default function RecoveryScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [starting, setStarting] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeCreatedResponse | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const res = await apiFetch<ChallengeCreatedResponse>('/auth/recovery/start', {
        method: 'POST',
        anonymous: true,
        body: { email: email.trim(), audience: 'customer' },
      });
      if (res.challengeId) setChallenge(res);
      else setSentMessage(res.message);
    } finally {
      setStarting(false);
    }
  };

  const complete = async () => {
    if (!challenge?.challengeId) return;
    setError(null);
    setCompleting(true);
    try {
      await apiFetch('/auth/recovery/complete', {
        method: 'POST',
        anonymous: true,
        body: { challengeId: challenge.challengeId, code: code.trim(), newPassword },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setCompleting(false);
    }
  };

  if (done) {
    return (
      <Screen contentContainerStyle={{ gap: space(6) }}>
        <AppStateView
          kind="success"
          title={t('state.success.title')}
          description={t('auth.resetDone')}
          primaryAction={{ label: t('action.signIn'), onPress: () => router.replace('/sign-in') }}
        />
      </Screen>
    );
  }

  if (sentMessage) {
    return (
      <Screen contentContainerStyle={{ gap: space(6) }}>
        <AppStateView
          kind="success"
          title={t('state.success.title')}
          description={sentMessage}
          primaryAction={{ label: t('action.signIn'), onPress: () => router.replace('/sign-in') }}
        />
      </Screen>
    );
  }

  if (challenge) {
    return (
      <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(6) }}>
        <View style={{ gap: space(1) }}>
          <Text variant="display">{t('auth.recoverTitle')}</Text>
          <Text variant="body" color="mutedForeground">
            {challenge.message}
          </Text>
          {challenge.devCode ? (
            <Text variant="small" color="mutedForeground">
              {t('auth.devCodeLabel')} {challenge.devCode}
            </Text>
          ) : null}
        </View>
        <Field label={t('auth.recoveryCode')} required>
          <Input value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={12} />
        </Field>
        <Field label={t('auth.newPassword')} required hint={t('auth.newPasswordHint')} error={error}>
          <PasswordInput value={newPassword} onChangeText={setNewPassword} textContentType="newPassword" />
        </Field>
        <Button fullWidth size="lg" loading={completing} disabled={!code || !newPassword} onPress={complete}>
          {t('action.confirm')}
        </Button>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(5), paddingBottom: space(8) }}>
      <View style={{ gap: space(1) }}>
        <Text variant="display">{t('auth.recoverTitle')}</Text>
        <Text variant="body" color="mutedForeground">
          {t('site.auth.recoverySub')}
        </Text>
      </View>
      <Card style={{ gap: space(4) }}>
        <Field label={t('auth.email')} required>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="name@example.com"
            leftIcon={<KeyRound size={18} color={colors.mutedForeground} />}
          />
        </Field>
        <Button fullWidth size="lg" loading={starting} disabled={!email} onPress={start}>
          {t('auth.sendInstructions')}
        </Button>
        <Text
          variant="small"
          color="primary"
          style={{ textAlign: 'center' }}
          onPress={() => router.replace('/sign-in')}
        >
          {t('auth.backToSignIn')}
        </Text>
      </Card>
      <Card style={{ gap: space(2), backgroundColor: colors.muted }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <ShieldCheck size={18} color={colors.primary} />
          <Text variant="bodyStrong">{t('site.auth.pitchTitle')}</Text>
        </View>
        <Text variant="small" color="mutedForeground">
          {t('site.auth.pitchText')}
        </Text>
      </Card>
    </Screen>
  );
}
