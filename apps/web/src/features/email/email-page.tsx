import { useI18n } from '@carrental/i18n/react';
import { CheckCircle2, Inbox, Mail, Pencil, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { SmtpSheet } from './smtp-sheet';

import { DetailList } from '@/components/detail-list';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmailConfig, useUpdateEmailConfig, type EmailDriver } from '@/lib/admin-hooks';
import { cn } from '@/lib/utils';

const MODES: Array<{ driver: EmailDriver; icon: LucideIcon }> = [
  { driver: 'outbox', icon: Inbox },
  { driver: 'smtp', icon: Mail },
];

/**
 * The email provider settings: switch between the local outbox (development — messages are kept,
 * never delivered) and a real SMTP provider. `email.manage` only, and every write is step-up
 * confirmed. The SMTP password is write-only — the API returns a masked last four.
 */
export function EmailPage() {
  const { t, fmt } = useI18n();
  const config = useEmailConfig();
  const update = useUpdateEmailConfig();
  const [editing, setEditing] = useState(false);

  async function switchTo(driver: EmailDriver) {
    try {
      await update.mutateAsync({ activeDriver: driver });
      toast.success(t('ops.email.switched', { mode: t(`ops.email.mode.${driver}`) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.email.switchFail'));
    }
  }

  if (config.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.email.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void config.refetch()}
        />
      </Page>
    );
  }
  const d = config.data;
  if (!d) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }
  const dash = <span className="text-muted-foreground">—</span>;

  return (
    <Page>
      <PageHeader title={t('ops.email.title')} description={t('ops.email.subtitle')} />

      <SectionCard
        icon={CheckCircle2}
        title={t('ops.email.activeMode')}
        description={
          <>
            {t('ops.email.activeModeHint')}
            {d.updatedAt
              ? ` · ${t('ops.email.lastChanged', { when: fmt.dateTime(d.updatedAt) })}`
              : ''}
          </>
        }
      >
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t('ops.email.activeMode')}
        >
          {MODES.map(({ driver, icon: Icon }) => {
            const active = d.activeDriver === driver;
            return (
              <button
                key={driver}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={update.isPending}
                onClick={() => {
                  if (active) return;
                  if (driver === 'smtp' && !d.smtp.configured) setEditing(true);
                  else void switchTo(driver);
                }}
                data-testid={`email-mode-${driver}`}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/50 hover:bg-accent/40',
                )}
              >
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-lg',
                    active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-medium">{t(`ops.email.mode.${driver}`)}</span>
                {active ? <Badge variant="success">{t('ops.email.current')}</Badge> : null}
                {driver === 'smtp' && !d.smtp.configured && !active ? (
                  <span className="text-xs text-muted-foreground">
                    {t('ops.email.needsConfig')}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={Mail}
        title={t('ops.email.smtpSection')}
        description={t('ops.email.smtpSectionHint')}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            data-testid="email-configure"
          >
            <Pencil aria-hidden="true" />
            {t(d.smtp.configured ? 'ops.email.edit' : 'ops.email.setUp')}
          </Button>
        }
      >
        <div className="space-y-4">
          <Badge variant={d.smtp.configured ? 'success' : 'secondary'}>
            {t(d.smtp.configured ? 'ops.email.configured' : 'ops.email.notConfigured')}
          </Badge>
          <DetailList
            items={[
              {
                term: t('ops.email.host'),
                detail: d.smtp.host ? (
                  <span className="bidi-isolate">
                    {d.smtp.host}
                    {d.smtp.port ? `:${d.smtp.port}` : ''}
                  </span>
                ) : (
                  dash
                ),
              },
              {
                term: t('ops.email.secure'),
                detail: t(d.smtp.secure ? 'ops.loc.yes' : 'ops.loc.no'),
              },
              { term: t('ops.email.username'), detail: d.smtp.username || dash },
              {
                term: t('ops.email.password'),
                detail: d.smtp.configured ? (
                  <span className="bidi-isolate font-mono text-xs">
                    {d.smtp.passwordLast4
                      ? `••••${d.smtp.passwordLast4}`
                      : t('ops.email.configuredNoDetail')}
                  </span>
                ) : (
                  dash
                ),
              },
              {
                term: t('ops.email.fromAddress'),
                detail: d.smtp.fromAddress ? (
                  <span className="bidi-isolate">{d.smtp.fromAddress}</span>
                ) : (
                  dash
                ),
              },
              { term: t('ops.email.fromName'), detail: d.smtp.fromName || dash },
              {
                term: t('ops.pay.verifiedAt'),
                detail: d.smtp.verifiedAt ? fmt.dateTime(d.smtp.verifiedAt) : dash,
              },
            ]}
          />
        </div>
      </SectionCard>

      {editing ? <SmtpSheet config={d} open onOpenChange={setEditing} /> : null}
    </Page>
  );
}
