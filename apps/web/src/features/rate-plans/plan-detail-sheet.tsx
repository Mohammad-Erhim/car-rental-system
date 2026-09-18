import { useI18n } from '@carrental/i18n/react';
import { Copy, Pencil, Rocket, Trash2 } from 'lucide-react';

import { isEditable } from './plan-model';
import { PlanStatus } from './plan-status';

import { DetailList } from '@/components/detail-list';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { RatePlan } from '@/lib/ops-discovery-hooks';

export type PlanAction = 'edit' | 'publish' | 'delete' | 'clone';

/** Every term of a plan, read-only, with the actions its status allows. */
export function PlanDetailSheet({
  plan,
  scopeName,
  canPublish,
  onAction,
  open,
  onOpenChange,
}: {
  plan: RatePlan;
  scopeName: string;
  canPublish: boolean;
  onAction: (action: PlanAction) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const money = (minor: number) => fmt.money({ amountMinor: minor, currency: plan.currency });
  const editable = isEditable(plan.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('action.close')} className="p-0 sm:max-w-lg">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b p-6 pe-12">
            <SheetTitle className="flex flex-wrap items-center gap-2">
              {plan.name}
              <PlanStatus status={plan.status} />
            </SheetTitle>
            <SheetDescription>
              <span className="bidi-isolate font-mono">{plan.categoryCode}</span> · {scopeName}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <DetailList
              className="sm:grid-cols-2 xl:grid-cols-2"
              items={[
                { term: t('ops.rp.baseDay'), detail: money(plan.baseDayMinor) },
                {
                  term: t('ops.rp.extraHour'),
                  detail: plan.hourMinor ? money(plan.hourMinor) : '—',
                },
                { term: t('ops.rp.taxPct'), detail: `${+(plan.taxBps / 100).toFixed(2)}%` },
                {
                  term: t('ops.rp.currency'),
                  detail: <span className="bidi-isolate">{plan.currency}</span>,
                },
                {
                  term: t('ops.rp.effectiveFrom'),
                  detail: `${fmt.date(plan.effectiveFrom)}${plan.effectiveTo ? ` – ${fmt.date(plan.effectiveTo)}` : ''}`,
                },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              {t('ops.rp.durationRange', {
                min: plan.minDurationHours,
                max: plan.maxDurationHours ?? '∞',
              })}
            </p>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('ops.rp.fees')}</h3>
              {plan.fees.length ? (
                <ul className="divide-y rounded-lg border">
                  {plan.fees.map((f) => (
                    <li
                      key={f.code}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <span>
                        {f.label}
                        {f.taxable === false ? null : (
                          <span className="ms-2 text-xs text-muted-foreground">
                            ({t('ops.rp.feeTaxable')})
                          </span>
                        )}
                      </span>
                      <span className="font-medium tabular-nums">{money(f.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('ops.rp.tiers')}</h3>
              {plan.tiers.length ? (
                <ul className="divide-y rounded-lg border">
                  {plan.tiers.map((tr) => (
                    <li
                      key={tr.minHours}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <span className="tabular-nums">≥ {tr.minHours}h</span>
                      <span className="font-medium tabular-nums">
                        {money(tr.dayMinor)}
                        <span className="text-muted-foreground"> {t('ops.rp.perDay')}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </section>
          </div>

          {canPublish ? (
            <SheetFooter className="border-t bg-muted/20 p-6">
              {editable ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => onAction('delete')}
                    className="text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    {t('ops.rp.deleteDraft')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onAction('edit')}
                    data-testid={`rp-edit-${plan.id}`}
                  >
                    <Pencil aria-hidden="true" />
                    {t('ops.rp.editDraft')}
                  </Button>
                  <Button onClick={() => onAction('publish')} data-testid={`rp-publish-${plan.id}`}>
                    <Rocket aria-hidden="true" />
                    {t('ops.rp.publish')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => onAction('clone')}
                  data-testid={`rp-clone-${plan.id}`}
                >
                  <Copy aria-hidden="true" />
                  {t('ops.rp.clone')}
                </Button>
              )}
            </SheetFooter>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
