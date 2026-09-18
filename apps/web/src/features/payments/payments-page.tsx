import { useI18n } from '@carrental/i18n/react';
import {
  CheckCircle2,
  CreditCard,
  KeyRound,
  ShieldAlert,
  TestTube2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { KeysSheet } from './keys-sheet';
import { LiveDialog } from './live-dialog';

import { DetailList } from '@/components/detail-list';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePaymentConfig,
  useUpdatePaymentConfig,
  type PaymentConfigSummary,
  type PaymentDriver,
} from '@/lib/admin-hooks';
import { cn } from '@/lib/utils';

type Modal = { kind: 'keys'; mode: 'test' | 'live' } | { kind: 'live' };

const MODES: Array<{ driver: PaymentDriver; icon: LucideIcon; needs?: 'test' | 'live' }> = [
  { driver: 'simulator', icon: CreditCard },
  { driver: 'stripe_test', icon: TestTube2, needs: 'test' },
  { driver: 'stripe_live', icon: ShieldAlert, needs: 'live' },
];

function KeysSummary({ mode, config }: { mode: 'test' | 'live'; config: PaymentConfigSummary }) {
  const { t, fmt } = useI18n();
  const c = config[mode];
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <DetailList
      className="sm:grid-cols-1 xl:grid-cols-1"
      items={[
        {
          term: t('ops.pay.publishableKey'),
          detail: c.publishableKey ? (
            <span className="bidi-isolate break-all font-mono text-xs">{c.publishableKey}</span>
          ) : (
            dash
          ),
        },
        {
          term: t('ops.pay.secretKey'),
          detail: c.configured ? (
            <span className="bidi-isolate font-mono text-xs">
              {c.secretKeyLast4 ? `••••${c.secretKeyLast4}` : t('ops.pay.configuredNoDetail')}
            </span>
          ) : (
            dash
          ),
        },
        {
          term: t('ops.pay.webhookSecret'),
          detail: c.webhookConfigured ? t('ops.pay.configuredNoDetail') : dash,
        },
        {
          term: t('ops.pay.verifiedAt'),
          detail: c.verifiedAt ? fmt.dateTime(c.verifiedAt) : dash,
        },
      ]}
    />
  );
}

/**
 * SCREEN-OPS-041 — the payment provider switch (DEC-006). `payment.manage` only — the one screen
 * that decides where real money goes — and every write is step-up confirmed by the shared
 * provider. Secret keys are write-only: the API returns just a masked last four and a
 * "configured" flag.
 */
export function PaymentsPage() {
  const { t, fmt } = useI18n();
  const config = usePaymentConfig();
  const update = useUpdatePaymentConfig();
  const [modal, setModal] = useState<Modal | null>(null);
  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  async function switchTo(driver: PaymentDriver) {
    try {
      await update.mutateAsync({ activeDriver: driver });
      toast.success(t('ops.pay.switched', { mode: t(`ops.pay.mode.${driver}`) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.pay.switchFail'));
    }
  }

  if (config.isError) {
    return (
      <Page>
        <StateView
          kind="error"
          title={t('ops.pay.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void config.refetch()}
        />
      </Page>
    );
  }
  if (!config.data) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }
  const d = config.data;

  return (
    <Page>
      <PageHeader title={t('ops.pay.title')} description={t('ops.pay.subtitle')} />

      <SectionCard
        icon={CheckCircle2}
        title={t('ops.pay.activeMode')}
        description={
          <>
            {t('ops.pay.activeModeHint')}
            {d.updatedAt
              ? ` · ${t('ops.pay.lastChanged', { when: fmt.dateTime(d.updatedAt) })}`
              : ''}
          </>
        }
      >
        <div
          className="grid gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label={t('ops.pay.activeMode')}
        >
          {MODES.map(({ driver, icon: Icon, needs }) => {
            const active = d.activeDriver === driver;
            const blocked = needs ? !d[needs].configured : false;
            const live = driver === 'stripe_live';
            return (
              <button
                key={driver}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={blocked || update.isPending}
                onClick={() => {
                  if (active) return;
                  if (live) setModal({ kind: 'live' });
                  else void switchTo(driver);
                }}
                data-testid={`payment-mode-${driver}`}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  active
                    ? live
                      ? 'border-destructive bg-destructive/5'
                      : 'border-primary bg-primary/5'
                    : 'hover:border-primary/50 hover:bg-accent/40',
                )}
              >
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-lg',
                    active
                      ? live
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-medium">{t(`ops.pay.mode.${driver}`)}</span>
                {active ? (
                  <Badge variant={live ? 'destructive' : 'success'}>{t('ops.pay.current')}</Badge>
                ) : null}
                {blocked ? (
                  <span className="text-xs text-muted-foreground">{t('ops.pay.needsKey')}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {(['test', 'live'] as const).map((mode) => (
          <SectionCard
            key={mode}
            icon={mode === 'test' ? TestTube2 : ShieldAlert}
            title={t(mode === 'test' ? 'ops.pay.testSection' : 'ops.pay.liveSection')}
            description={t(mode === 'test' ? 'ops.pay.testSectionHint' : 'ops.pay.liveSectionHint')}
            className={mode === 'live' ? 'border-destructive/30' : undefined}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModal({ kind: 'keys', mode })}
                data-testid={`pay-manage-${mode}`}
              >
                <KeyRound aria-hidden="true" />
                {t('ops.pay.manageKeys')}
              </Button>
            }
          >
            <div className="space-y-4">
              <Badge variant={d[mode].configured ? 'success' : 'secondary'}>
                {t(d[mode].configured ? 'ops.pay.keysConfigured' : 'ops.pay.keysMissing')}
              </Badge>
              <KeysSummary mode={mode} config={d} />
            </div>
          </SectionCard>
        ))}
      </div>

      {modal?.kind === 'keys' ? (
        <KeysSheet mode={modal.mode} config={d} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'live' ? <LiveDialog open onOpenChange={close} /> : null}
    </Page>
  );
}
