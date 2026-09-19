import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { CheckCircle2, History, Plus } from 'lucide-react';
import { useState } from 'react';

import { payloadOf, POLICY_KEYS, startValues } from './policy-model';
import { PolicySheet } from './policy-sheet';

import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateSwitcher } from '@/components/state-switcher';
import { Button } from '@/components/ui/button';
import { ConfigHistory } from '@/features/config-workflow/config-history';
import {
  useConfigVersions,
  useConfigVersionTransition,
  useDeleteConfigVersion,
  type ConfigVersion,
} from '@/lib/admin-hooks';
import { useListParams } from '@/lib/use-list-params';

const KIND = 'policy';

/**
 * SCREEN-OPS-033/034 — Configuration versioning. A policy change is drafted, previewed, submitted,
 * then published (directly, or after an optional review); publishing supersedes the
 * previous revision and applies with no redeploy, and a published revision is never edited in
 * place (FR-ADM-005). The page shows what is in force and the revision trail; changes are proposed
 * in a sheet.
 */
export function PolicyPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(['setting'] as const);
  const setting = POLICY_KEYS.find((k) => k.key === state.setting) ?? POLICY_KEYS[0]!;
  const [sheet, setSheet] = useState<{ from: ConfigVersion | null } | null>(null);

  const versions = useConfigVersions(KIND, setting.key);
  const transition = useConfigVersionTransition();
  const remove = useDeleteConfigVersion();
  const live = versions.data?.find((v) => v.state === 'published') ?? null;

  /** A human reading of a stored value: bps as a percentage, hours as hours. */
  const fmtValue = (name: string, v: number): string => {
    if (!Number.isFinite(v)) return String(v);
    if (name === 'lateFeeBps') return fmt.percent(v / 10000, { maximumFractionDigits: 2 });
    if (name === 'freeCancelHours') return t('ops.cfg.fmt.hours', { n: fmt.number(v) });
    if (name === 'minorPerPct') return t('ops.cfg.fmt.minorPerPct', { n: fmt.number(v) });
    return fmt.number(v);
  };
  const describe = (v: ConfigVersion) =>
    setting.fields
      .map((f) => `${t(`ops.cfg.short.${f}`)} ${fmtValue(f, payloadOf(v)[f] as number)}`)
      .join(' · ');

  return (
    <Page>
      <PageHeader title={t('ops.cfg.titlePolicies')} description={t('ops.cfg.subtitle2')} />

      <StateSwitcher
        label={t('ops.cfg.setting')}
        value={setting.key}
        onChange={(v) => update({ setting: v === POLICY_KEYS[0]!.key ? '' : v })}
        testIdPrefix="config-key"
        options={POLICY_KEYS.map((k) => ({ value: k.key, label: t(`ops.cfg.key.${k.key}`) }))}
      />

      <SectionCard
        icon={CheckCircle2}
        title={t('ops.cfg.currentValues')}
        description={
          live
            ? `${t('ops.cfg.rev', { n: live.revision })}${live.effectiveFrom ? ` · ${fmt.dateTime(live.effectiveFrom)}` : ''}`
            : t('ops.cfg.noPublished')
        }
        actions={
          canPublish ? (
            <Button
              size="sm"
              onClick={() => setSheet({ from: null })}
              data-testid="config-new"
              aria-label={t('ops.cfg.newFor', { setting: t(`ops.cfg.key.${setting.key}`) })}
            >
              <Plus aria-hidden="true" />
              {t('ops.cfg.newDraft')}
            </Button>
          ) : null
        }
        data-testid="config-current-published"
      >
        {live ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {setting.fields.map((f) => (
              <div key={f} className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`ops.cfg.short.${f}`)}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {fmtValue(f, payloadOf(live)[f] as number)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('ops.cfg.noPublishedHint')}</p>
        )}
      </SectionCard>

      <SectionCard
        icon={History}
        title={t('ops.cfg.revHistory', {
          area: t(`ops.cfg.kind.${KIND}`),
          setting: t(`ops.cfg.key.${setting.key}`),
        })}
      >
        <ConfigHistory
          versions={versions.data}
          isLoading={versions.isLoading}
          canPublish={canPublish}
          pending={transition.isPending}
          limit={10}
          describe={describe}
          onRevise={canPublish ? (v) => setSheet({ from: v }) : undefined}
          onAction={transition.mutateAsync}
          onDelete={remove.mutateAsync}
        />
      </SectionCard>

      {sheet ? (
        <PolicySheet
          key={`${setting.key}:${sheet.from?.id ?? 'new'}`}
          kind={KIND}
          setting={setting}
          initial={startValues(setting, sheet.from)}
          current={live ? payloadOf(live) : null}
          open
          onOpenChange={(o) => {
            if (!o) setSheet(null);
          }}
        />
      ) : null}
    </Page>
  );
}
