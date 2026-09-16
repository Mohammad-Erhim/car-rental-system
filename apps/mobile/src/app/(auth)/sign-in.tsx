import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'expo-router';
import { CheckCircle2, LockKeyhole, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Input, PasswordInput, Screen, Text } from '../../components/ui';
import { useFormErrors } from '../../lib/api/hooks/use-form-errors';
import { ApiError } from '../../lib/api/query-client';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';

const PITCH_POINTS = ['site.auth.point1', 'site.auth.point2', 'site.auth.point3'] as const;

export default function SignInScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const formErrors = useFormErrors();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    formErrors.clear();
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
      router.back();
    } catch (err) {
      if (err instanceof ApiError) formErrors.fromError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(6) }}>
      <View style={{ gap: space(1) }}>
        <Text variant="display">{t('action.signIn')}</Text>
        <Text variant="body" color="mutedForeground">
          {t('site.auth.signInSub')}
        </Text>
      </View>

      <View style={{ gap: space(4) }}>
        <Field label={t('auth.email')} required error={formErrors.fieldError('email')}>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            placeholder="name@example.com"
            leftIcon={<Mail size={18} color={colors.mutedForeground} />}
          />
        </Field>
        <Field label={t('auth.password')} required error={formErrors.fieldError('password')}>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            textContentType="password"
            autoComplete="current-password"
            placeholder={t('auth.password')}
            leftIcon={<LockKeyhole size={18} color={colors.mutedForeground} />}
          />
        </Field>

        {formErrors.topLevelMessage ? (
          <Text variant="small" color="destructive">
            {formErrors.topLevelMessage}
          </Text>
        ) : null}

        <Text variant="small" color="primary" onPress={() => router.push('/recovery')}>
          {t('auth.forgotPw')}
        </Text>

        <Button fullWidth size="lg" loading={submitting} onPress={submit} disabled={!email || !password}>
          {t('action.signIn')}
        </Button>

        <View style={{ flexDirection: 'row', gap: space(1), justifyContent: 'center' }}>
          <Text variant="small" color="mutedForeground">
            {t('auth.signIn.noAccount')}
          </Text>
          <Text variant="small" color="primary" onPress={() => router.push('/register')}>
            {t('action.register')}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.muted, borderRadius: 16, padding: space(5), gap: space(3) }}>
        <Text variant="caption" color="primary">
          {t('site.auth.eyebrow')}
        </Text>
        <Text variant="h3">{t('site.auth.pitchTitle')}</Text>
        <Text variant="small" color="mutedForeground">
          {t('site.auth.pitchText')}
        </Text>
        {PITCH_POINTS.map((key) => (
          <View key={key} style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-start' }}>
            <CheckCircle2 size={16} color={colors.primary} />
            <Text variant="small" style={{ flex: 1 }}>
              {t(key)}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
