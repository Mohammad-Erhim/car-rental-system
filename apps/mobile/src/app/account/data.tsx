import { useI18n } from '@carrental/i18n/react';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppStateView, Badge, Button, Card, Field, Input, Screen, Text } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useCreateDataRequest, useDataRequests } from '../../lib/api/hooks/use-account';
import { useAuth } from '../../lib/auth/auth-provider';
import { useTheme } from '../../lib/theme/theme-provider';

const KINDS = ['access', 'correction', 'closure'] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = { access: 'privacy.kind.access', correction: 'privacy.kind.correction', closure: 'privacy.kind.closure' };
const KIND_HINT: Record<Kind, string> = {
  access: 'privacy.kind.accessHint',
  correction: 'privacy.kind.correctionHint',
  closure: 'privacy.kind.closureHint',
};
const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'destructive'> = {
  received: 'neutral',
  in_review: 'primary',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'neutral',
  blocked: 'warning',
};

export default function DataRequestsScreen() {
  const { t, fmt } = useI18n();
  const { colors, space } = useTheme();
  const { actor } = useAuth();
  const toast = useToast();
  const requestsQuery = useDataRequests(!!actor);
  const createRequest = useCreateDataRequest();

  const [kind, setKind] = useState<Kind>('access');
  const [detail, setDetail] = useState('');

  const submit = async () => {
    try {
      await createRequest.mutateAsync({ kind, detail: detail || undefined });
      setDetail('');
      toast.show(t('state.success.title'), 'success');
    } catch {
      toast.show(t('privacy.submitErr'), 'error');
    }
  };

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(5) }}>
      <Stack.Screen options={{ title: t('privacy.title') }} />
      <Text variant="body" color="mutedForeground">
        {t('privacy.intro')}
      </Text>

      {requestsQuery.isLoading ? (
        <AppStateView kind="loading" inline />
      ) : !requestsQuery.data?.length ? (
        <AppStateView kind="empty" inline title={t('privacy.none')} />
      ) : (
        <View style={{ gap: space(3) }}>
          <Text variant="h3">{t('privacy.yourRequests')}</Text>
          {requestsQuery.data.map((r) => (
            <Card key={r.id} style={{ gap: space(2) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="bodyStrong">{t(KIND_LABEL[r.kind as Kind] as 'privacy.kind.access')}</Text>
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`privacy.status.${r.status}` as 'privacy.status.received')}</Badge>
              </View>
              <Text variant="caption" color="mutedForeground">
                {fmt.dateTime(r.createdAt)}
              </Text>
              {r.blockers.length > 0 && (
                <View style={{ gap: 2 }}>
                  <Text variant="small" color="warning">
                    {t('privacy.blockedForNow')}
                  </Text>
                  {r.blockers.map((b, i) => (
                    <Text key={i} variant="caption" color="mutedForeground">
                      {b.detail}
                    </Text>
                  ))}
                </View>
              )}
            </Card>
          ))}
        </View>
      )}

      <Card style={{ gap: space(4) }}>
        <Text variant="h3">{t('privacy.open')}</Text>
        <View style={{ gap: space(2) }}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space(3),
                padding: space(3),
                borderRadius: 12,
                borderWidth: 1,
                borderColor: kind === k ? colors.primary : colors.border,
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 1.5,
                  borderColor: kind === k ? colors.primary : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {kind === k && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body">{t(KIND_LABEL[k] as 'privacy.kind.access')}</Text>
                <Text variant="small" color="mutedForeground">
                  {t(KIND_HINT[k] as 'privacy.kind.accessHint')}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Field label={t('privacy.detailLabel')}>
          <Input value={detail} onChangeText={setDetail} placeholder={t('privacy.detailPlaceholder')} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top' }} />
        </Field>

        <Button fullWidth loading={createRequest.isPending} onPress={submit}>
          {t('privacy.submit')}
        </Button>
      </Card>
    </Screen>
  );
}
