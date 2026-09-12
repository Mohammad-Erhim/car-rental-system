import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@carrental/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useNotificationRule,
  useSaveTemplateDraft,
  useTemplateDetail,
  useTemplateGroups,
  useTemplatePreview,
  useTemplateTransition,
  useUpsertNotificationRule,
  type TemplateVar,
} from '../../lib/admin-hooks.js';
import { useMetaLocales } from '../../lib/api-hooks.js';
import { ApiError } from '../../lib/api.js';

/**
 * SCREEN-OPS-033 / FR-ADM-011 — notification template administration (content half). Edit the
 * localized subject / body / declared variables of a transactional template, preview with sample
 * values, and move it draft → in&nbsp;review → published with a validation gate (declared
 * variables, required legal content). The event-rules half (trigger / audience / timing / retry /
 * escalation / sender identity) is a documented follow-up.
 */
export function TemplatesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const groups = useTemplateGroups();
  const metaLocales = useMetaLocales();
  // the *live* active-locale set (DEC-024) — a language added from /ops/config/languages must be
  // authorable here even before any row for it exists, not just the locales a row happens to have.
  const activeLocales = useMemo(
    () => metaLocales.data?.locales.filter((l) => !l.testOnly).map((l) => l.code) ?? [],
    [metaLocales.data],
  );
  const [sel, setSel] = useState<{ key: string; channel: string; locale: string } | null>(null);

  useEffect(() => {
    if (!sel && groups.data && groups.data.length > 0) {
      const g = groups.data[0]!;
      setSel({ key: g.key, channel: g.channel, locale: g.locales[0]?.localeCode ?? 'en' });
    }
  }, [groups.data, sel]);

  const detail = useTemplateDetail(sel?.key ?? null, sel?.channel ?? null, sel?.locale ?? null);
  const saveDraft = useSaveTemplateDraft();
  const preview = useTemplatePreview();
  const transition = useTemplateTransition();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [vars, setVars] = useState<TemplateVar[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  // Re-sync the form from the server only when the *selection* changes — not when a save creates
  // a fresh draft row for the same (key, channel, locale), which would otherwise wipe an
  // in-flight preview and re-render the editor mid-interaction.
  const syncedFor = useRef<string | null>(null);
  // a locale that's active but has no row yet (a newly added language) — not a real failure
  const isNewLocale =
    detail.isError && detail.error instanceof ApiError && detail.error.code === 'not_found';

  useEffect(() => {
    const selKey = sel ? `${sel.key}:${sel.channel}:${sel.locale}` : null;
    if (!selKey || syncedFor.current === selKey) return;
    if (detail.data) {
      syncedFor.current = selKey;
      setSubject(detail.data.subject ?? '');
      setBody(detail.data.bodyTemplate);
      setVars(detail.data.variables ?? []);
      setDirty(false);
    } else if (isNewLocale) {
      // no row for this (key, channel, locale) yet — start blank, never leak the previously
      // selected locale's content into what looks like a fresh draft
      syncedFor.current = selKey;
      setSubject('');
      setBody('');
      setVars([]);
      setDirty(false);
    }
  }, [detail.data, isNewLocale, sel]);

  const referenced = useMemo(() => {
    const set = new Set<string>();
    for (const m of `${subject}\n${body}`.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
      set.add(m[1]!.split('.')[0]!);
    }
    return set;
  }, [subject, body]);
  const undeclared = [...referenced].filter((v) => !vars.some((x) => x.name === v));

  function update<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setDirty(true);
  }

  async function onSave() {
    if (!sel) return;
    try {
      await saveDraft.mutateAsync({
        key: sel.key,
        channel: sel.channel,
        localeCode: sel.locale,
        subject: subject || null,
        bodyTemplate: body,
        variables: vars,
      });
      setDirty(false);
      toast({ title: t('ops.tpl.draftSaved'), variant: 'success' });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t('ops.tpl.draftFail') });
    }
  }

  function runPreview() {
    preview.mutate(
      { subject: subject || null, bodyTemplate: body, variables: vars },
      {
        onError: (e) => toast({ title: e instanceof Error ? e.message : t('ops.tpl.previewFail') }),
      },
    );
  }

  if (groups.isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (groups.isError || !groups.data)
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        description={t('ops.tpl.loadError')}
        primaryAction={{ label: t('action.retry'), onClick: () => groups.refetch() }}
      />
    );

  const d = detail.data;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.tpl.title')} description={t('ops.tpl.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {/* template list */}
        <Card className="h-max">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.tpl.list')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {groups.data.map((g) => {
              // every active language gets a tab, even one with no row yet (a newly added
              // language must be authorable here, not just already-templated locales)
              const tabs = [
                ...g.locales.map((l) => ({ ...l, started: true })),
                ...activeLocales
                  .filter((code) => !g.locales.some((l) => l.localeCode === code))
                  .map((code) => ({ localeCode: code, hasDraft: false, started: false })),
              ];
              return (
                <div key={`${g.key}:${g.channel}`} className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{g.key}</span>
                    <Badge variant="neutral">{g.channel}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tabs.map((l) => {
                      const active =
                        sel?.key === g.key &&
                        sel?.channel === g.channel &&
                        sel?.locale === l.localeCode;
                      return (
                        <button
                          key={l.localeCode}
                          type="button"
                          onClick={() => {
                            preview.reset();
                            setSel({ key: g.key, channel: g.channel, locale: l.localeCode });
                          }}
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            active
                              ? 'bg-primary text-primary-foreground'
                              : l.started
                                ? 'bg-muted'
                                : 'border border-dashed border-muted-foreground/40 text-muted-foreground'
                          }`}
                          title={l.started ? undefined : t('ops.tpl.notStarted')}
                          data-testid={`tpl-loc-${g.key}-${l.localeCode}`}
                        >
                          {l.localeCode}
                          {l.hasDraft ? ' •' : !l.started ? ' +' : ''}
                        </button>
                      );
                    })}
                  </div>
                  {g.missingLocales.length > 0 ? (
                    <p className="mt-1 text-xs text-warning">
                      {t('ops.tpl.missingLocales', { list: g.missingLocales.join(', ') })}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* editor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {sel ? `${sel.key} · ${sel.channel} · ${sel.locale}` : t('ops.tpl.selectOne')}
            </CardTitle>
            {d ? (
              <p className="text-xs text-muted-foreground">
                {t('ops.tpl.statusLine', {
                  status: t(`ops.cfg.state.${d.status}`),
                  version: d.version,
                })}
              </p>
            ) : isNewLocale ? (
              <p className="text-xs text-muted-foreground">{t('ops.tpl.notStarted')}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.isLoading ? (
              <AppStateView kind="loading" title={t('state.loading.title')} inline />
            ) : detail.isError && !isNewLocale ? (
              <AppStateView
                kind="failure"
                inline
                title={t('ops.tpl.loadError')}
                primaryAction={{ label: t('action.retry'), onClick: () => detail.refetch() }}
              />
            ) : (
              <>
                <Field label={t('ops.tpl.subject')}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={subject}
                      onChange={(e) => update(setSubject, e.target.value)}
                      disabled={!canPublish}
                    />
                  )}
                </Field>
                <Field label={t('ops.tpl.body')} required hint={t('ops.tpl.bodyHint')}>
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={10}
                      value={body}
                      onChange={(e) => update(setBody, e.target.value)}
                      disabled={!canPublish}
                      data-testid="tpl-body"
                    />
                  )}
                </Field>

                <div>
                  <p className="mb-1 text-sm font-medium">{t('ops.tpl.variables')}</p>
                  <div className="space-y-1">
                    {vars.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Input
                          className="max-w-[12rem]"
                          data-testid="tpl-var-name"
                          aria-label={t('ops.tpl.variables')}
                          value={v.name}
                          onChange={(e) =>
                            update(
                              setVars,
                              vars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          disabled={!canPublish}
                        />
                        <label className="flex items-center gap-1">
                          <Checkbox
                            checked={!!v.required}
                            onChange={(e) =>
                              update(
                                setVars,
                                vars.map((x, j) =>
                                  j === i ? { ...x, required: e.target.checked } : x,
                                ),
                              )
                            }
                            disabled={!canPublish}
                          />
                          {t('ops.tpl.required')}
                        </label>
                        <label className="flex items-center gap-1">
                          <Checkbox
                            checked={!!v.legal}
                            onChange={(e) =>
                              update(
                                setVars,
                                vars.map((x, j) =>
                                  j === i ? { ...x, legal: e.target.checked } : x,
                                ),
                              )
                            }
                            disabled={!canPublish}
                          />
                          {t('ops.tpl.legal')}
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canPublish}
                          onClick={() =>
                            update(
                              setVars,
                              vars.filter((_, j) => j !== i),
                            )
                          }
                        >
                          {t('action.remove')}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    disabled={!canPublish}
                    onClick={() => update(setVars, [...vars, { name: '' }])}
                  >
                    {t('ops.tpl.addVariable')}
                  </Button>
                  {undeclared.length > 0 ? (
                    <p className="mt-1 text-xs text-destructive" data-testid="tpl-undeclared">
                      {t('ops.tpl.undeclared', { list: undeclared.join(', ') })}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={onSave}
                    disabled={!canPublish || !dirty || undeclared.length > 0 || saveDraft.isPending}
                  >
                    {t('ops.tpl.saveDraft')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={runPreview}
                    loading={preview.isPending}
                    disabled={preview.isPending}
                  >
                    {t('ops.tpl.preview')}
                  </Button>
                  {d?.hasOpenDraft && d.status === 'draft' ? (
                    <Button
                      variant="outline"
                      disabled={!canPublish || dirty || transition.isPending}
                      onClick={() => transition.mutate({ id: d.id, action: 'submit' })}
                    >
                      {t('ops.tpl.submit')}
                    </Button>
                  ) : null}
                  {d?.hasOpenDraft && (d.status === 'draft' || d.status === 'in_review') ? (
                    <Button
                      disabled={!canPublish || dirty || transition.isPending}
                      onClick={() => setConfirmPublish(true)}
                      data-testid="tpl-publish"
                    >
                      {t('ops.tpl.publish')}
                    </Button>
                  ) : null}
                </div>

                {preview.data ? (
                  <Card className="bg-muted/40" data-testid="tpl-preview">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm">{t('ops.tpl.previewTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="font-medium">{preview.data.subject}</p>
                      <pre className="whitespace-pre-wrap font-sans">{preview.data.body}</pre>
                      {preview.data.missingVars.length > 0 ? (
                        <p className="text-xs text-warning">
                          {t('ops.tpl.missingVars', { list: preview.data.missingVars.join(', ') })}
                        </p>
                      ) : null}
                      {preview.data.contentIssues.length > 0 ? (
                        <ul className="list-disc pl-4 text-xs text-destructive">
                          {preview.data.contentIssues.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {sel ? <RuleCard event={sel.key} channel={sel.channel} canPublish={canPublish} /> : null}

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={t('ops.tpl.publishTitle')}
        description={t('ops.tpl.publishBody', {
          key: sel?.key ?? '',
          channel: sel?.channel ?? '',
          locale: sel?.locale ?? '',
        })}
        confirmLabel={t('ops.tpl.publish')}
        onConfirm={async () => {
          if (d) await transition.mutateAsync({ id: d.id, action: 'publish' });
        }}
      />
    </div>
  );
}

/**
 * FR-ADM-011 event-rules half — the delivery policy for this (event, channel): trigger toggle,
 * audience, send delay + quiet hours, retry + escalation, sender identity. Content stays in the
 * editor above. Timing / escalation are stored + surfaced; a scheduler enforcing them is a
 * documented follow-up — the enable gate + sender identity apply on send today.
 */
function RuleCard({
  event,
  channel,
  canPublish,
}: {
  event: string;
  channel: string;
  canPublish: boolean;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const rule = useNotificationRule(event, channel);
  const save = useUpsertNotificationRule();
  const [form, setForm] = useState<{
    enabled: boolean;
    audience: string;
    delayMinutes: string;
    quietStart: string;
    quietEnd: string;
    maxAttempts: string;
    retryBackoffMinutes: string;
    escalateAfterAttempts: string;
    senderIdentity: string;
  } | null>(null);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${event}:${channel}`;
    if (rule.data && syncedFor.current !== key) {
      syncedFor.current = key;
      const d = rule.data;
      setForm({
        enabled: d.enabled,
        audience: d.audience,
        delayMinutes: String(d.delayMinutes),
        quietStart: d.quietHours?.start ?? '',
        quietEnd: d.quietHours?.end ?? '',
        maxAttempts: String(d.maxAttempts),
        retryBackoffMinutes: String(d.retryBackoffMinutes),
        escalateAfterAttempts:
          d.escalateAfterAttempts == null ? '' : String(d.escalateAfterAttempts),
        senderIdentity: d.senderIdentity ?? '',
      });
    }
  }, [rule.data, event, channel]);

  if (!form || !rule.data) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const quietHours =
      form.quietStart && form.quietEnd ? { start: form.quietStart, end: form.quietEnd } : null;
    save.mutate(
      {
        event,
        channel,
        enabled: form.enabled,
        audience: form.audience as 'primary_renter' | 'account_holder' | 'all_drivers' | 'ops',
        delayMinutes: Math.max(0, Number(form.delayMinutes) || 0),
        quietHours,
        maxAttempts: Math.max(1, Number(form.maxAttempts) || 1),
        retryBackoffMinutes: Math.max(0, Number(form.retryBackoffMinutes) || 0),
        escalateAfterAttempts: form.escalateAfterAttempts
          ? Math.max(1, Number(form.escalateAfterAttempts))
          : null,
        senderIdentity: form.senderIdentity.trim() || null,
      },
      {
        onSuccess: () => toast({ title: t('ops.rule.saved'), variant: 'success' }),
        onError: (e) => toast({ title: e instanceof Error ? e.message : t('ops.rule.saveFail') }),
      },
    );
  };

  return (
    <Card data-testid="rule-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {t('ops.rule.title')}
          {rule.data.isDefault ? <Badge variant="neutral">{t('ops.rule.default')}</Badge> : null}
          <Badge variant={form.enabled ? 'success' : 'destructive'} data-testid="rule-enabled">
            {form.enabled ? t('ops.rule.on') : t('ops.rule.off')}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {event} · {channel}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">
          <AlertDescription>{t('ops.rule.notEnforcedNotice')}</AlertDescription>
        </Alert>
        <form onSubmit={submit} className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('ops.rule.enabled')} hint={t('ops.rule.enabledHint')}>
            {({ id, describedBy }) => (
              <div className="flex h-[var(--control-h)] items-center">
                <Checkbox
                  id={id}
                  aria-describedby={describedBy}
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => f && { ...f, enabled: e.target.checked })}
                  disabled={!canPublish}
                  data-testid="rule-toggle"
                />
              </div>
            )}
          </Field>
          <Field label={t('ops.rule.audience')} hint={t('ops.rule.audienceHint')}>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.audience}
                onChange={(e) => setForm((f) => f && { ...f, audience: e.target.value })}
                disabled={!canPublish}
                data-testid="rule-audience"
              >
                <option value="primary_renter">{t('ops.rule.aud.primary_renter')}</option>
                <option value="account_holder">{t('ops.rule.aud.account_holder')}</option>
                <option value="all_drivers">{t('ops.rule.aud.all_drivers')}</option>
                <option value="ops">{t('ops.rule.aud.ops')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('ops.rule.sender')} hint={t('ops.rule.senderHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.senderIdentity}
                onChange={(e) => setForm((f) => f && { ...f, senderIdentity: e.target.value })}
                disabled={!canPublish}
                maxLength={60}
                data-testid="rule-sender"
              />
            )}
          </Field>
          <Field label={t('ops.rule.delay')} hint={t('ops.rule.delayHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={0}
                max={100_000}
                value={form.delayMinutes}
                onChange={(e) => setForm((f) => f && { ...f, delayMinutes: e.target.value })}
                disabled={!canPublish}
              />
            )}
          </Field>
          <Field label={t('ops.rule.quietStart')} hint={t('ops.rule.quietStartHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="time"
                value={form.quietStart}
                onChange={(e) => setForm((f) => f && { ...f, quietStart: e.target.value })}
                disabled={!canPublish}
              />
            )}
          </Field>
          <Field label={t('ops.rule.quietEnd')} hint={t('ops.rule.quietEndHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="time"
                value={form.quietEnd}
                onChange={(e) => setForm((f) => f && { ...f, quietEnd: e.target.value })}
                disabled={!canPublish}
              />
            )}
          </Field>
          <Field label={t('ops.rule.maxAttempts')} hint={t('ops.rule.maxAttemptsHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={form.maxAttempts}
                onChange={(e) => setForm((f) => f && { ...f, maxAttempts: e.target.value })}
                disabled={!canPublish}
              />
            )}
          </Field>
          <Field label={t('ops.rule.backoff')} hint={t('ops.rule.backoffHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={0}
                max={10_080}
                value={form.retryBackoffMinutes}
                onChange={(e) => setForm((f) => f && { ...f, retryBackoffMinutes: e.target.value })}
                disabled={!canPublish}
              />
            )}
          </Field>
          <Field label={t('ops.rule.escalate')} hint={t('ops.rule.escalateHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={form.escalateAfterAttempts}
                onChange={(e) =>
                  setForm((f) => f && { ...f, escalateAfterAttempts: e.target.value })
                }
                disabled={!canPublish}
              />
            )}
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={!canPublish || save.isPending} data-testid="rule-save">
              {t('ops.rule.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
