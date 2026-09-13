import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  PasswordInput,
  useToast,
} from '@carrental/ui';
import { CreditCard, ShieldAlert, TestTube2 } from 'lucide-react';
import { useState } from 'react';

import {
  useUpdatePaymentConfig,
  usePaymentConfig,
  type PaymentDriver,
} from '../../lib/admin-hooks.js';
import { ApiError } from '../../lib/api.js';

/**
 * SCREEN-OPS-041 — the payment provider switch (DEC-006 follow-up). `payment.manage`-gated
 * (administrator only — narrower than every other admin permission, since this is the one
 * screen that decides where real money goes) and every write is step-up-confirmed (the shared
 * `StepUpProvider` intercepts the 401 automatically, same as sending a report schedule).
 *
 * Secret keys are write-only from this screen's point of view: the API never returns one back,
 * only a masked last-4 and a "configured" flag — so a saved key always shows as a locked,
 * placeholder field until the operator deliberately chooses to replace it.
 */
export function PaymentsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const config = usePaymentConfig();
  const update = useUpdatePaymentConfig();

  const [testPublishable, setTestPublishable] = useState('');
  const [testSecret, setTestSecret] = useState('');
  const [testWebhook, setTestWebhook] = useState('');
  const [editTestSecret, setEditTestSecret] = useState(false);
  const [editTestWebhook, setEditTestWebhook] = useState(false);

  const [livePublishable, setLivePublishable] = useState('');
  const [liveSecret, setLiveSecret] = useState('');
  const [liveWebhook, setLiveWebhook] = useState('');
  const [editLiveSecret, setEditLiveSecret] = useState(false);
  const [editLiveWebhook, setEditLiveWebhook] = useState(false);
  const [acknowledgeLive, setAcknowledgeLive] = useState(false);

  const [confirmDriver, setConfirmDriver] = useState<PaymentDriver | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

  async function saveTest() {
    setErr(null);
    try {
      await update.mutateAsync({
        test: {
          publishableKey: testPublishable || undefined,
          secretKey: editTestSecret && testSecret ? testSecret : undefined,
          webhookSecret: editTestWebhook && testWebhook ? testWebhook : undefined,
        },
      });
      setTestSecret('');
      setTestWebhook('');
      setEditTestSecret(false);
      setEditTestWebhook(false);
      toast({ title: t('ops.pay.savedTest'), variant: 'success' });
    } catch (e) {
      setErr(errText(e, t('ops.pay.saveFail')));
    }
  }

  async function saveLive() {
    setErr(null);
    try {
      await update.mutateAsync({
        live: {
          publishableKey: livePublishable || undefined,
          secretKey: editLiveSecret && liveSecret ? liveSecret : undefined,
          webhookSecret: editLiveWebhook && liveWebhook ? liveWebhook : undefined,
        },
      });
      setLiveSecret('');
      setLiveWebhook('');
      setEditLiveSecret(false);
      setEditLiveWebhook(false);
      toast({ title: t('ops.pay.savedLive'), variant: 'success' });
    } catch (e) {
      setErr(errText(e, t('ops.pay.saveFail')));
    }
  }

  async function switchDriver(driver: PaymentDriver) {
    setErr(null);
    try {
      await update.mutateAsync(
        driver === 'stripe_live'
          ? { activeDriver: driver, live: { acknowledgeLive: true } }
          : { activeDriver: driver },
      );
      toast({
        title: t('ops.pay.switched', { mode: t(`ops.pay.mode.${driver}`) }),
        variant: 'success',
      });
    } catch (e) {
      setErr(errText(e, t('ops.pay.switchFail')));
    } finally {
      setConfirmDriver(null);
    }
  }

  if (config.isLoading) {
    return <AppStateView kind="loading" title={t('state.loading.title')} />;
  }
  if (config.isError || !config.data) {
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        description={errText(config.error, t('ops.pay.loadFail'))}
        primaryAction={{ label: t('action.retry'), onClick: () => config.refetch() }}
      />
    );
  }
  const d = config.data;
  const modeOptions: Array<{
    driver: PaymentDriver;
    Icon: typeof TestTube2;
    label: string;
    disabled?: boolean;
  }> = [
    { driver: 'simulator', Icon: CreditCard, label: t('ops.pay.mode.simulator') },
    {
      driver: 'stripe_test',
      Icon: TestTube2,
      label: t('ops.pay.mode.stripe_test'),
      disabled: !d.test.configured,
    },
    {
      driver: 'stripe_live',
      Icon: ShieldAlert,
      label: t('ops.pay.mode.stripe_live'),
      disabled: !d.live.configured,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.pay.title')} description={t('ops.pay.subtitle')} />

      {err ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.pay.activeMode')}</CardTitle>
          <CardDescription>
            {t('ops.pay.activeModeHint')}
            {d.updatedAt ? ` · ${t('ops.pay.lastChanged', { when: d.updatedAt })}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {modeOptions.map(({ driver, Icon, label, disabled }) => {
              const active = d.activeDriver === driver;
              return (
                <button
                  key={driver}
                  type="button"
                  disabled={disabled || update.isPending}
                  onClick={() =>
                    driver === 'stripe_live' ? setConfirmDriver(driver) : switchDriver(driver)
                  }
                  data-testid={`payment-mode-${driver}`}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? driver === 'stripe_live'
                        ? 'border-destructive bg-destructive/5'
                        : 'border-primary bg-primary/5'
                      : 'hover:border-primary/50 hover:bg-accent/40'
                  }`}
                >
                  <span
                    className={`grid size-9 place-items-center rounded-md ${
                      active
                        ? driver === 'stripe_live'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-medium">{label}</span>
                  {active ? (
                    <Badge variant={driver === 'stripe_live' ? 'destructive' : 'success'}>
                      {t('ops.pay.current')}
                    </Badge>
                  ) : null}
                  {disabled ? (
                    <span className="text-xs text-muted-foreground">{t('ops.pay.needsKey')}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <TestTube2 className="size-3.5" aria-hidden="true" />
            </span>
            {t('ops.pay.testSection')}
          </CardTitle>
          <CardDescription>{t('ops.pay.testSectionHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label={t('ops.pay.publishableKey')}
            htmlFor="pay-test-pk"
            hint={t('ops.pay.publishableKeyHint')}
          >
            {({ id }) => (
              <Input
                id={id}
                placeholder={d.test.publishableKey ?? 'pk_test_…'}
                value={testPublishable}
                onChange={(e) => setTestPublishable(e.target.value)}
                data-testid="pay-test-publishable"
              />
            )}
          </Field>
          <SecretField
            id="pay-test-secret"
            label={t('ops.pay.secretKey')}
            configured={d.test.configured}
            last4={d.test.secretKeyLast4}
            editing={editTestSecret}
            onEdit={() => setEditTestSecret(true)}
            value={testSecret}
            onChange={setTestSecret}
            t={t}
          />
          <SecretField
            id="pay-test-webhook"
            label={t('ops.pay.webhookSecret')}
            hint={t('ops.pay.webhookSecretHint')}
            configured={d.test.webhookConfigured}
            last4={null}
            editing={editTestWebhook}
            onEdit={() => setEditTestWebhook(true)}
            value={testWebhook}
            onChange={setTestWebhook}
            t={t}
          />
          <Button onClick={saveTest} loading={update.isPending} data-testid="pay-save-test">
            {t('ops.pay.saveTest')}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
              <ShieldAlert className="size-3.5" aria-hidden="true" />
            </span>
            {t('ops.pay.liveSection')}
          </CardTitle>
          <CardDescription>{t('ops.pay.liveSectionHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t('ops.pay.publishableKey')} htmlFor="pay-live-pk">
            {({ id }) => (
              <Input
                id={id}
                placeholder={d.live.publishableKey ?? 'pk_live_…'}
                value={livePublishable}
                onChange={(e) => setLivePublishable(e.target.value)}
                data-testid="pay-live-publishable"
              />
            )}
          </Field>
          <SecretField
            id="pay-live-secret"
            label={t('ops.pay.secretKey')}
            configured={d.live.configured}
            last4={d.live.secretKeyLast4}
            editing={editLiveSecret}
            onEdit={() => setEditLiveSecret(true)}
            value={liveSecret}
            onChange={setLiveSecret}
            t={t}
          />
          <SecretField
            id="pay-live-webhook"
            label={t('ops.pay.webhookSecret')}
            hint={t('ops.pay.webhookSecretHint')}
            configured={d.live.webhookConfigured}
            last4={null}
            editing={editLiveWebhook}
            onEdit={() => setEditLiveWebhook(true)}
            value={liveWebhook}
            onChange={setLiveWebhook}
            t={t}
          />
          <Button
            variant="destructive"
            onClick={saveLive}
            loading={update.isPending}
            data-testid="pay-save-live"
          >
            {t('ops.pay.saveLive')}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDriver === 'stripe_live'}
        onOpenChange={(v) => !v && setConfirmDriver(null)}
        destructive
        title={t('ops.pay.liveConfirmTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.pay.liveConfirmBody')}</p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={acknowledgeLive}
                onChange={(e) => setAcknowledgeLive(e.target.checked)}
                data-testid="pay-ack-live"
              />
              {t('ops.pay.liveConfirmAck')}
            </label>
          </div>
        }
        confirmLabel={t('ops.pay.liveConfirmAction')}
        confirmDisabled={!acknowledgeLive}
        onConfirm={() => switchDriver('stripe_live')}
      />
    </div>
  );
}

function SecretField({
  id,
  label,
  hint,
  configured,
  last4,
  editing,
  onEdit,
  value,
  onChange,
  t,
}: {
  id: string;
  label: string;
  hint?: string;
  configured: boolean;
  last4: string | null;
  editing: boolean;
  onEdit: () => void;
  value: string;
  onChange: (v: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  if (configured && !editing) {
    return (
      <Field label={label} htmlFor={id} hint={hint}>
        {() => (
          <div className="flex items-center gap-2">
            <span
              className="flex h-10 flex-1 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm text-muted-foreground"
              data-testid={`${id}-configured`}
            >
              {last4 ?? t('ops.pay.configuredNoDetail')}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              {t('ops.pay.replaceKey')}
            </Button>
          </div>
        )}
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      {({ id: inputId }) => (
        <PasswordInput
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          revealLabel={t('auth.showPw')}
          hideLabel={t('auth.hidePw')}
          data-testid={id}
        />
      )}
    </Field>
  );
}
