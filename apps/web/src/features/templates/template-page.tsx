import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { ArrowLeft, Eye, FileText, Pencil, Rocket, Send, Settings2, Variable } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { RuleSheet } from './rule-sheet';
import { localeTabs } from './template-model';
import { TemplatePreviewDialog } from './template-preview-dialog';
import { TemplateSheet } from './template-sheet';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { DetailList } from '@/components/detail-list';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BreadcrumbLabelSetter } from '@/layouts/breadcrumb-label';
import {
  useNotificationRule,
  useTemplateDetail,
  useTemplateGroups,
  useTemplateTransition,
} from '@/lib/admin-hooks';
import { ApiError } from '@/lib/api';
import { useMetaLocales } from '@/lib/api-hooks';
import { useListParams } from '@/lib/use-list-params';

type Modal = 'edit' | 'preview' | 'publish' | 'rule';
const PARAMS = ['locale'] as const;

/**
 * One notification template: its languages as tabs, the saved content for the chosen language with
 * its draft → in review → published steps, its declared variables, and the delivery rule for the
 * event. Writing happens in a side sheet; publishing is confirmed because it goes live at once.
 */
export function TemplatePage() {
  const { t } = useI18n();
  const { key = '', channel = '' } = useParams();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(PARAMS);
  const [modal, setModal] = useState<Modal | null>(null);

  const groups = useTemplateGroups();
  const metaLocales = useMetaLocales();
  const group = groups.data?.find((g) => g.key === key && g.channel === channel);
  // the live active-language set (DEC-024): a language added on the Languages page is writable here
  // before any row exists for it
  const active = metaLocales.data?.locales.filter((l) => !l.testOnly).map((l) => l.code) ?? [];
  const tabs = localeTabs(group?.locales ?? [], active);
  const locale = state.locale || tabs[0]?.code || 'en';

  const detail = useTemplateDetail(key, channel, locale);
  const rule = useNotificationRule(key, channel);
  const transition = useTemplateTransition();
  const d = detail.data;
  const isNew = detail.error instanceof ApiError && detail.error.code === 'not_found';
  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  if (groups.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.tpl.loadError')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void groups.refetch()}
        />
      </Page>
    );
  }

  const canSubmit = !!d?.hasOpenDraft && d.status === 'draft';
  const canGoLive = !!d?.hasOpenDraft && (d.status === 'draft' || d.status === 'in_review');
  const r = rule.data;

  return (
    <Page data-testid="tpl-page">
      <BreadcrumbLabelSetter label={key} />
      <div className="-mb-2">
        <Button variant="ghost" size="sm" className="-ms-2.5 text-muted-foreground" asChild>
          <Link to="/config/templates">
            <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
            {t('ops.tpl.title')}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={<span className="bidi-isolate break-all font-mono text-2xl sm:text-3xl">{key}</span>}
        badge={<Badge variant="secondary">{channel}</Badge>}
        description={t('ops.tpl.pageHint')}
      />

      <Card className="p-4 sm:p-5">
        <StateSwitcher
          label={t('ops.tpl.languages')}
          value={locale}
          onChange={(v) => update({ locale: v })}
          testIdPrefix="tpl-loc"
          options={tabs.map((l) => ({
            value: l.code,
            label: `${l.code.toUpperCase()}${l.hasDraft ? ' •' : l.started ? '' : ' +'}`,
          }))}
        />
        {group?.missingLocales.length ? (
          <p className="mt-3 text-xs text-warning">
            {t('ops.tpl.missingLocales', { list: group.missingLocales.join(', ') })}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SectionCard
          icon={FileText}
          title={t('ops.tpl.contentIn', { locale: locale.toUpperCase() })}
          description={
            d ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    d.status === 'published'
                      ? 'success'
                      : d.status === 'in_review'
                        ? 'default'
                        : 'secondary'
                  }
                >
                  {t(`ops.cfg.state.${d.status}`)}
                </Badge>
                {d.version !== 'draft' ? (
                  <span>{t('ops.tpl.versionLine', { version: d.version })}</span>
                ) : null}
              </span>
            ) : undefined
          }
          actions={
            d && canPublish ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setModal('preview')}>
                  <Eye aria-hidden="true" />
                  {t('ops.tpl.preview')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModal('edit')}
                  data-testid="tpl-edit"
                >
                  <Pencil aria-hidden="true" />
                  {t('ops.cat.edit')}
                </Button>
              </div>
            ) : null
          }
        >
          {detail.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : isNew ? (
            <StateView icon={FileText} title={t('ops.tpl.notStarted')} className="py-10">
              {canPublish ? (
                <Button size="sm" onClick={() => setModal('edit')} data-testid="tpl-start">
                  <Pencil aria-hidden="true" />
                  {t('ops.tpl.start')}
                </Button>
              ) : null}
            </StateView>
          ) : detail.isError ? (
            <StateView
              kind="error"
              title={t('ops.tpl.loadError')}
              actionLabel={t('ops.st.retry')}
              onAction={() => void detail.refetch()}
            />
          ) : d ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border">
                <p className="border-b bg-muted/40 px-4 py-2.5 text-sm font-medium" dir="auto">
                  {d.subject || (
                    <span className="text-muted-foreground">{t('ops.tpl.noSubject')}</span>
                  )}
                </p>
                <pre
                  className="max-h-[50dvh] overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px]"
                  dir="auto"
                >
                  {d.bodyTemplate}
                </pre>
              </div>
              {canPublish && (canSubmit || canGoLive) ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {canSubmit ? (
                    <Button
                      variant="outline"
                      loading={transition.isPending}
                      onClick={async () => {
                        try {
                          await transition.mutateAsync({ id: d.id, action: 'submit' });
                          toast.success(t('ops.tpl.submitted'));
                        } catch {
                          /* useWorkflowError already reports it */
                        }
                      }}
                    >
                      <Send aria-hidden="true" />
                      {t('ops.tpl.submit')}
                    </Button>
                  ) : null}
                  {canGoLive ? (
                    <Button onClick={() => setModal('publish')} data-testid="tpl-publish">
                      <Rocket aria-hidden="true" />
                      {t('ops.tpl.publish')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard icon={Variable} title={t('ops.tpl.variables')}>
            {d?.variables.length ? (
              <ul className="space-y-2" data-testid="tpl-vars">
                {d.variables.map((v) => (
                  <li key={v.name} className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="bidi-isolate rounded bg-muted px-1.5 py-0.5 text-xs">{`{{${v.name}}}`}</code>
                    {v.required ? <Badge variant="outline">{t('ops.tpl.required')}</Badge> : null}
                    {v.legal ? <Badge variant="warning">{t('ops.tpl.legal')}</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('ops.tpl.noVariables')}</p>
            )}
          </SectionCard>

          <SectionCard
            icon={Settings2}
            title={t('ops.rule.title')}
            actions={
              r && canPublish ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModal('rule')}
                  data-testid="rule-edit"
                >
                  <Pencil aria-hidden="true" />
                  {t('ops.cat.edit')}
                </Button>
              ) : null
            }
            data-testid="rule-card"
          >
            {r ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.enabled ? 'success' : 'destructive'} data-testid="rule-enabled">
                    {t(r.enabled ? 'ops.rule.on' : 'ops.rule.off')}
                  </Badge>
                  {r.isDefault ? <Badge variant="outline">{t('ops.rule.default')}</Badge> : null}
                </div>
                <DetailList
                  className="sm:grid-cols-2 xl:grid-cols-2"
                  items={[
                    { term: t('ops.rule.audience'), detail: t(`ops.rule.aud.${r.audience}`) },
                    { term: t('ops.rule.sender'), detail: r.senderIdentity || '—' },
                    { term: t('ops.rule.delay'), detail: `${r.delayMinutes} min` },
                    {
                      term: t('ops.rule.secQuiet'),
                      detail: r.quietHours ? `${r.quietHours.start}–${r.quietHours.end}` : '—',
                    },
                    { term: t('ops.rule.maxAttempts'), detail: r.maxAttempts },
                    { term: t('ops.rule.backoff'), detail: `${r.retryBackoffMinutes} min` },
                  ]}
                />
                <Alert variant="info">
                  <AlertDescription>{t('ops.rule.notEnforcedNotice')}</AlertDescription>
                </Alert>
              </div>
            ) : (
              <Skeleton className="h-32 rounded-lg" />
            )}
          </SectionCard>
        </div>
      </div>

      {modal === 'edit' ? (
        <TemplateSheet
          key={`${locale}:${d?.id ?? 'new'}`}
          templateKey={key}
          channel={channel}
          locale={locale}
          detail={isNew ? null : (d ?? null)}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal === 'preview' && d ? (
        <TemplatePreviewDialog detail={d} open onOpenChange={close} />
      ) : null}
      {modal === 'rule' && r ? (
        <RuleSheet rule={r} event={key} channel={channel} open onOpenChange={close} />
      ) : null}
      {modal === 'publish' && d ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={t('ops.tpl.publishTitle')}
          description={t('ops.tpl.publishBody', { key, channel, locale })}
          confirmLabel={t('ops.tpl.publish')}
          onConfirm={async () => {
            await transition.mutateAsync({ id: d.id, action: 'publish' });
            toast.success(t('ops.tpl.published'));
          }}
        />
      ) : null}
    </Page>
  );
}
