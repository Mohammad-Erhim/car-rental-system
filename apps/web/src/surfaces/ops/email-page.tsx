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
  Field,
  Input,
  PageHeader,
  PasswordInput,
  useToast,
} from '@carrental/ui';
import { Inbox, Mail } from 'lucide-react';
import { useState } from 'react';

import { useEmailConfig, useUpdateEmailConfig, type EmailDriver } from '../../lib/admin-hooks.js';
import { ApiError } from '../../lib/api.js';

/**
 * The email provider settings screen — the dashboard-configurable switch between the local
 * outbox driver (dev/simulator, visible at /ops/dev/mail, never actually delivered) and a real
 * SMTP provider. `email.manage`-gated (administrator only) and every write is step-up-confirmed
 * (same tier as the payments screen).
 *
 * The SMTP password is write-only from this screen's point of view: the API never returns one
 * back, only a masked last-4 and a "configured" flag.
 */
export function EmailPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const config = useEmailConfig();
  const update = useUpdateEmailConfig();

  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [editPassword, setEditPassword] = useState(false);
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

  const d = config.data;

  function seedFromConfig() {
    if (!d) return;
    setHost(d.smtp.host ?? '');
    setPort(d.smtp.port ? String(d.smtp.port) : '587');
    setSecure(d.smtp.secure);
    setUsername(d.smtp.username ?? '');
    setFromAddress(d.smtp.fromAddress ?? '');
    setFromName(d.smtp.fromName ?? '');
    setPassword('');
    setEditPassword(false);
    setErr(null);
  }

  async function saveSmtp(activate: boolean) {
    setErr(null);
    try {
      await update.mutateAsync({
        activeDriver: activate ? 'smtp' : undefined,
        smtp: {
          host,
          port: Number(port) || undefined,
          secure,
          username,
          password: editPassword && password ? password : undefined,
          fromAddress,
          fromName,
        },
      });
      setPassword('');
      setEditPassword(false);
      toast({
        title: activate ? t('ops.email.switchedToSmtp') : t('ops.email.saved'),
        variant: 'success',
      });
    } catch (e) {
      setErr(errText(e, t('ops.email.saveFail')));
    }
  }

  async function switchDriver(driver: EmailDriver) {
    setErr(null);
    try {
      await update.mutateAsync({ activeDriver: driver });
      toast({
        title: t('ops.email.switched', { mode: t(`ops.email.mode.${driver}`) }),
        variant: 'success',
      });
    } catch (e) {
      setErr(errText(e, t('ops.email.switchFail')));
    }
  }

  if (config.isLoading) {
    return <AppStateView kind="loading" title={t('state.loading.title')} />;
  }
  if (config.isError || !d) {
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        description={errText(config.error, t('ops.email.loadFail'))}
        primaryAction={{ label: t('action.retry'), onClick: () => config.refetch() }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.email.title')} description={t('ops.email.subtitle')} />

      {err ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.email.activeMode')}</CardTitle>
          <CardDescription>
            {t('ops.email.activeModeHint')}
            {d.updatedAt ? ` · ${t('ops.email.lastChanged', { when: d.updatedAt })}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => switchDriver('outbox')}
              disabled={update.isPending || d.activeDriver === 'outbox'}
              data-testid="email-mode-outbox"
              className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-start transition-colors disabled:cursor-not-allowed ${
                d.activeDriver === 'outbox'
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/50 hover:bg-accent/40'
              }`}
            >
              <span
                className={`grid size-9 place-items-center rounded-md ${
                  d.activeDriver === 'outbox'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Inbox className="size-4" aria-hidden="true" />
              </span>
              <span className="font-medium">{t('ops.email.mode.outbox')}</span>
              {d.activeDriver === 'outbox' ? (
                <Badge variant="success">{t('ops.email.current')}</Badge>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => (d.smtp.configured ? switchDriver('smtp') : seedFromConfig())}
              disabled={update.isPending || d.activeDriver === 'smtp'}
              data-testid="email-mode-smtp"
              className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-start transition-colors disabled:cursor-not-allowed ${
                d.activeDriver === 'smtp'
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/50 hover:bg-accent/40'
              }`}
            >
              <span
                className={`grid size-9 place-items-center rounded-md ${
                  d.activeDriver === 'smtp'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Mail className="size-4" aria-hidden="true" />
              </span>
              <span className="font-medium">{t('ops.email.mode.smtp')}</span>
              {d.activeDriver === 'smtp' ? (
                <Badge variant="success">{t('ops.email.current')}</Badge>
              ) : null}
              {!d.smtp.configured && d.activeDriver !== 'smtp' ? (
                <span className="text-xs text-muted-foreground">{t('ops.email.needsConfig')}</span>
              ) : null}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Mail className="size-3.5" aria-hidden="true" />
            </span>
            {t('ops.email.smtpSection')}
          </CardTitle>
          <CardDescription>{t('ops.email.smtpSectionHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t('ops.email.host')} htmlFor="email-host">
            {({ id }) => (
              <Input
                id={id}
                placeholder="smtp.example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                data-testid="email-host"
              />
            )}
          </Field>
          <Field label={t('ops.email.port')} htmlFor="email-port">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                data-testid="email-port"
              />
            )}
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              data-testid="email-secure"
            />
            <span>{t('ops.email.secure')}</span>
          </label>
          <Field label={t('ops.email.username')} htmlFor="email-username">
            {({ id }) => (
              <Input
                id={id}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="email-username"
              />
            )}
          </Field>
          <SecretField
            id="email-password"
            label={t('ops.email.password')}
            configured={d.smtp.configured}
            last4={d.smtp.passwordLast4}
            editing={editPassword}
            onEdit={() => setEditPassword(true)}
            value={password}
            onChange={setPassword}
            t={t}
          />
          <Field label={t('ops.email.fromAddress')} htmlFor="email-from-address">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                placeholder="noreply@example.com"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                data-testid="email-from-address"
              />
            )}
          </Field>
          <Field label={t('ops.email.fromName')} htmlFor="email-from-name">
            {({ id }) => (
              <Input
                id={id}
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                data-testid="email-from-name"
              />
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => saveSmtp(false)}
              loading={update.isPending}
              data-testid="email-save"
            >
              {t('ops.email.save')}
            </Button>
            <Button
              variant="outline"
              onClick={() => saveSmtp(true)}
              loading={update.isPending}
              data-testid="email-save-activate"
            >
              {t('ops.email.saveAndActivate')}
            </Button>
          </div>
          {d.smtp.verifiedAt ? (
            <p className="text-xs text-muted-foreground">
              {t('ops.email.verifiedAt', { when: d.smtp.verifiedAt })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SecretField({
  id,
  label,
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
      <Field label={label} htmlFor={id}>
        {() => (
          <div className="flex items-center gap-2">
            <span
              className="flex h-10 flex-1 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm text-muted-foreground"
              data-testid={`${id}-configured`}
            >
              {last4 ?? t('ops.email.configuredNoDetail')}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              {t('ops.email.replaceKey')}
            </Button>
          </div>
        )}
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id}>
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
