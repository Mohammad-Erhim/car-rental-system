import type { ChallengeCreatedResponse, SessionResponse } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Field, Input, PasswordInput, Screen, Text } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { apiFetch } from '../../lib/api/api-fetch';
import { useFormErrors } from '../../lib/api/hooks/use-form-errors';
import { ApiError } from '../../lib/api/query-client';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';

export default function RegisterScreen() {
  const { t, locale } = useI18n();
  const { space } = useTheme();
  const router = useRouter();
  const { applySession } = useAuth();
  const formErrors = useFormErrors();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [challenge, setChallenge] = useState<ChallengeCreatedResponse | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const submitRegister = async () => {
    formErrors.clear();
    setSubmitting(true);
    try {
      const res = await apiFetch<ChallengeCreatedResponse & { accountId: string }>('/auth/register', {
        method: 'POST',
        anonymous: true,
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          localeCode: locale,
          acceptTerms: true,
          marketingOptIn,
        },
      });
      setChallenge(res);
      setAccountId(res.accountId);
    } catch (err) {
      if (err instanceof ApiError) formErrors.fromError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const submitVerify = async () => {
    if (!challenge?.challengeId) return;
    setCodeError(null);
    setVerifying(true);
    try {
      const session = await apiFetch<SessionResponse>('/auth/verify-contact', {
        method: 'POST',
        anonymous: true,
        body: { challengeId: challenge.challengeId, code: code.trim() },
      });
      applySession(session);
      router.back();
    } catch (err) {
      setCodeError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!accountId) return;
    try {
      const res = await apiFetch<ChallengeCreatedResponse>('/auth/resend-verification', {
        method: 'POST',
        anonymous: true,
        body: { accountId },
      });
      setChallenge(res);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t('error.generic'), 'error');
    }
  };

  if (challenge) {
    return (
      <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(6) }}>
        <View style={{ gap: space(1) }}>
          <Text variant="display">{t('auth.register.verifyTitle')}</Text>
          <Text variant="body" color="mutedForeground">
            {t('auth.register.codeSentTo', { email: email.trim() })}
          </Text>
          {challenge.devCode ? (
            <Text variant="small" color="mutedForeground">
              {t('auth.devCodeLabel')} {challenge.devCode}
            </Text>
          ) : null}
        </View>

        <Field label={t('auth.register.codeLabel')} required error={codeError}>
          <Input value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={12} />
        </Field>

        <Button fullWidth size="lg" loading={verifying} disabled={!code} onPress={submitVerify}>
          {t('action.confirm')}
        </Button>
        <Pressable onPress={resend}>
          <Text variant="small" color="primary" style={{ textAlign: 'center' }}>
            {t('auth.register.resend')}
          </Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(6) }}>
      <View style={{ gap: space(1) }}>
        <Text variant="display">{t('action.register')}</Text>
        <Text variant="body" color="mutedForeground">
          {t('site.auth.registerSub')}
        </Text>
      </View>

      <View style={{ gap: space(4) }}>
        <Field label={t('auth.fullName')} required error={formErrors.fieldError('fullName')}>
          <Input
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            textContentType="name"
            placeholder="Jane Doe"
          />
        </Field>
        <Field label={t('auth.email')} required error={formErrors.fieldError('email')}>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="name@example.com"
          />
        </Field>
        <Field label={t('auth.password')} required hint={t('auth.register.passwordHint')} error={formErrors.fieldError('password')}>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            textContentType="newPassword"
            placeholder="••••••••••"
          />
        </Field>

        <ToggleRow label={t('auth.register.marketingOptIn')} value={marketingOptIn} onToggle={setMarketingOptIn} />
        <ToggleRow label={t('auth.register.acceptTerms')} value={acceptTerms} onToggle={setAcceptTerms} />

        {formErrors.topLevelMessage ? (
          <Text variant="small" color="destructive">
            {formErrors.topLevelMessage}
          </Text>
        ) : null}

        <Button
          fullWidth
          size="lg"
          loading={submitting}
          disabled={!fullName || !email || !password || !acceptTerms}
          onPress={submitRegister}
        >
          {t('action.register')}
        </Button>

        <View style={{ flexDirection: 'row', gap: space(1), justifyContent: 'center' }}>
          <Text variant="small" color="mutedForeground">
            {t('auth.register.haveAccount')}
          </Text>
          <Text variant="small" color="primary" onPress={() => router.push('/sign-in')}>
            {t('action.signIn')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  const { colors, space } = useTheme();
  return (
    <Pressable onPress={() => onToggle(!value)} style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-start' }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.primary : 'transparent',
          marginTop: 1,
        }}
      />
      <Text variant="small" style={{ flex: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}
