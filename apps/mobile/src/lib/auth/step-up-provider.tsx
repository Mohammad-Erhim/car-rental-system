import { useI18n } from '@carrental/i18n/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';

import { Button, Field, PasswordInput, Text } from '../../components/ui';
import { apiFetch } from '../api/api-fetch';
import { registerStepUpHandler } from '../api/token-store';
import { useTheme } from '../theme/theme-provider';
import { MODAL_SCRIM } from '../theme/tokens';


/**
 * Registers the step-up handler `apiFetch` calls on `auth_step_up_required` (SRS-SEC — a
 * password change and a few other sensitive actions need a *recent* password confirmation, not
 * just a valid session). Renders a small password modal on demand and resolves the pending
 * request once confirmed — mirrors the ops dashboard's step-up prompt (`stepUp.*` catalogue).
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { colors, radius, space } = useTheme();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const open = useCallback(() => {
    setPassword('');
    setError(null);
    setVisible(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    setVisible(false);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  const confirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/step-up', { method: 'POST', body: { password } });
      finish(true);
    } catch {
      setError(t('stepUp.failed'));
    } finally {
      setBusy(false);
    }
  }, [password, finish, t]);

  useEffect(() => {
    registerStepUpHandler(open);
    return () => registerStepUpHandler(null);
  }, [open]);

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish(false)}>
        <View style={{ flex: 1, backgroundColor: MODAL_SCRIM, justifyContent: 'center', padding: space(6) }}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius, padding: space(5), gap: space(4) }}>
            <View style={{ gap: space(1) }}>
              <Text variant="h3">{t('stepUp.title')}</Text>
              <Text variant="small" color="mutedForeground">
                {t('stepUp.body')}
              </Text>
            </View>
            <Field label={t('stepUp.password')} required error={error}>
              <PasswordInput value={password} onChangeText={setPassword} autoFocus />
            </Field>
            <View style={{ flexDirection: 'row', gap: space(2), justifyContent: 'flex-end' }}>
              <Button variant="ghost" onPress={() => finish(false)}>
                {t('action.cancel')}
              </Button>
              <Button onPress={confirm} loading={busy} disabled={!password}>
                {t('stepUp.confirm')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
