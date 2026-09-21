import { useAuth } from '@carrental/client/react';
import type { AdminCurrency } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Coins, MoreHorizontal, Plus, Power, PowerOff, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AddCurrencyDialog } from './add-currency-dialog';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrencyActions, useCurrencyOverview } from '@/lib/currency-hooks';

type Modal = { kind: 'add' } | { kind: 'default' | 'disable'; currency: AdminCurrency };

/**
 * SCREEN-OPS — Currencies (DEC-036). The currencies the business sells in: add one from the
 * supported list, choose the default, disable one. Rate plans and extras are priced per currency
 * and pick from this list; the customer site and app offer the ones that have prices. Nothing
 * here needs a redeploy — the switcher, the price lists and the checkout all read this list.
 */
export function CurrenciesPage() {
  const { t, locale } = useI18n();
  const canManage = useAuth().hasPermission('lookup.manage');
  const overview = useCurrencyOverview(locale);
  const { enable, setDefault, disable } = useCurrencyActions();
  const [modal, setModal] = useState<Modal | null>(null);
  const close = (open: boolean) => {
    if (!open) setModal(null);
  };

  const data = overview.data;

  const reenable = async (c: AdminCurrency) => {
    try {
      await enable.mutateAsync({ code: c.code });
      toast.success(t('ops.ccy.enabled', { code: c.code }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.ccy.actionFail'));
    }
  };

  const inUse = (c: AdminCurrency) => c.usage.ratePlans + c.usage.products > 0;

  const menu = (c: AdminCurrency) =>
    canManage ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('ops.resv.moreActions')}
            data-testid={`ccy-menu-${c.code}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {c.isActive ? (
            <>
              {!c.isDefault ? (
                <DropdownMenuItem onSelect={() => setModal({ kind: 'default', currency: c })}>
                  <Star aria-hidden="true" />
                  {t('ops.ccy.makeDefaultAction')}
                </DropdownMenuItem>
              ) : null}
              {!c.isDefault ? (
                <DropdownMenuItem onSelect={() => setModal({ kind: 'disable', currency: c })}>
                  <PowerOff aria-hidden="true" />
                  {t('ops.ccy.disable')}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void reenable(c)}>
              <Power aria-hidden="true" />
              {t('ops.ccy.enable')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <Page>
      <PageHeader
        title={t('ops.ccy.title')}
        description={t('ops.ccy.subtitle')}
        actions={
          canManage ? (
            <Button
              onClick={() => setModal({ kind: 'add' })}
              disabled={!data}
              data-testid="ccy-new"
            >
              <Plus aria-hidden="true" />
              {t('ops.ccy.add')}
            </Button>
          ) : null
        }
      />

      <Alert>
        <AlertDescription>{t('ops.ccy.howItWorks')}</AlertDescription>
      </Alert>

      {overview.isError ? (
        <StateView
          kind="error"
          title={t('ops.ccy.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void overview.refetch()}
          className="py-14"
        />
      ) : overview.isLoading || !data ? (
        <Card className="space-y-3 p-4" aria-busy="true" aria-label={t('ops.ccy.loading')}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : data.currencies.length === 0 ? (
        <StateView icon={Coins} title={t('ops.ccy.none')} className="py-14" />
      ) : (
        <Card className="divide-y" data-testid="ccy-list">
          {data.currencies.map((c) => (
            <div
              key={c.code}
              className="flex items-start gap-3 p-4"
              data-testid={`ccy-row-${c.code}`}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="bidi-isolate rounded bg-muted px-1.5 py-0.5 text-sm font-semibold">
                    {c.code}
                  </code>
                  <bdi className="font-medium">{c.label}</bdi>
                  {c.isDefault ? (
                    <Badge variant="default">
                      <Star className="me-1 size-3" aria-hidden="true" />
                      {t('ops.ccy.default')}
                    </Badge>
                  ) : null}
                  <Badge variant={c.isActive ? 'success' : 'secondary'}>
                    {t(c.isActive ? 'ops.ccy.on' : 'ops.ccy.off')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('ops.ccy.decimals', { n: c.digits })}
                  {' · '}
                  {t('ops.ccy.usage', { plans: c.usage.ratePlans, extras: c.usage.products })}
                </p>
              </div>
              {menu(c)}
            </div>
          ))}
        </Card>
      )}

      {modal?.kind === 'add' && data ? (
        <AddCurrencyDialog available={data.available} open onOpenChange={close} />
      ) : null}

      {modal?.kind === 'default' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={t('ops.ccy.defaultTitle', { code: modal.currency.code })}
          description={t('ops.ccy.defaultBody')}
          confirmLabel={t('ops.ccy.makeDefaultAction')}
          onConfirm={async () => {
            await setDefault.mutateAsync(modal.currency.code);
            toast.success(t('ops.ccy.defaulted', { code: modal.currency.code }));
          }}
        />
      ) : null}

      {modal?.kind === 'disable' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={t('ops.ccy.disableTitle', { code: modal.currency.code })}
          description={
            <span className="block space-y-3">
              <span className="block">{t('ops.ccy.disableBody')}</span>
              {inUse(modal.currency) ? (
                <Alert variant="warning">
                  <AlertDescription>
                    {t('ops.ccy.disableInUse', {
                      plans: modal.currency.usage.ratePlans,
                      extras: modal.currency.usage.products,
                    })}
                  </AlertDescription>
                </Alert>
              ) : null}
            </span>
          }
          confirmLabel={t('ops.ccy.disable')}
          onConfirm={async () => {
            // the list already told us whether it is in use; confirming here *is* the
            // confirmation the server asks for
            await disable.mutateAsync({ code: modal.currency.code, force: inUse(modal.currency) });
            toast.success(t('ops.ccy.disabled', { code: modal.currency.code }));
          }}
        />
      ) : null}
    </Page>
  );
}
