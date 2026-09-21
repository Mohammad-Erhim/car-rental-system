import { REPORT_COMPARE, REPORT_GRANULARITIES, REPORT_PRESETS } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';

import type { ReportView } from './report-params';

import { ChoiceTabs } from '@/components/choice-tabs';
import { ToggleChips } from '@/components/toggle-chips';
import { Input } from '@/components/ui/input';

const BASES = ['booked', 'pickup', 'return'] as const;

/**
 * Everything a person can change about a report, all of it visible: the period (presets or exact
 * days), what to compare with, how to group the trend, which date places a booking in the period,
 * and which vehicle categories. Changing any of it updates the report at once — there is no
 * "apply" button to forget.
 */
export function ReportFilters({
  view,
  onChange,
  usesBasis,
  categories,
}: {
  view: ReportView;
  onChange: (
    patch: Partial<Record<'preset' | 'from' | 'to' | 'compare' | 'basis' | 'gran' | 'cat', string>>,
  ) => void;
  usesBasis: boolean;
  categories: Array<{ code: string; name: string }>;
}) {
  const { t } = useI18n();
  const invalidRange =
    view.preset === 'custom' && view.from !== '' && view.to !== '' && view.from > view.to;
  const field = 'space-y-1.5';
  const legend = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';
  return (
    <div className="space-y-4" data-testid="report-filters">
      <div className={field}>
        <p className={legend}>{t('ops.rpt.f.period')}</p>
        <ChoiceTabs
          label={t('ops.rpt.f.period')}
          value={view.preset}
          onChange={(v) => onChange({ preset: v })}
          testIdPrefix="rpt-preset"
          options={REPORT_PRESETS.map((p) => ({ value: p, label: t(`ops.rpt.preset.${p}`) }))}
        />
        {view.preset === 'custom' ? (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">{t('ops.rpt.f.from')}</span>
              <Input
                type="date"
                value={view.from}
                max={view.to || undefined}
                onChange={(e) => onChange({ from: e.target.value })}
                data-testid="rpt-from"
                className="w-44"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">{t('ops.rpt.f.to')}</span>
              <Input
                type="date"
                value={view.to}
                min={view.from || undefined}
                onChange={(e) => onChange({ to: e.target.value })}
                data-testid="rpt-to"
                className="w-44"
              />
            </label>
            <p
              className="pb-2 text-xs text-muted-foreground"
              role={invalidRange ? 'alert' : undefined}
            >
              {invalidRange ? t('ops.rpt.f.rangeInvalid') : t('ops.rpt.f.customHint')}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={field}>
          <p className={legend}>{t('ops.rpt.f.compare')}</p>
          <ChoiceTabs
            label={t('ops.rpt.f.compare')}
            value={view.compare}
            onChange={(v) => onChange({ compare: v })}
            testIdPrefix="rpt-compare"
            options={REPORT_COMPARE.map((c) => ({ value: c, label: t(`ops.rpt.compare.${c}`) }))}
          />
        </div>
        <div className={field}>
          <p className={legend}>{t('ops.rpt.f.group')}</p>
          <ChoiceTabs
            label={t('ops.rpt.f.group')}
            value={view.granularity || 'auto'}
            onChange={(v) => onChange({ gran: v === 'auto' ? '' : v })}
            testIdPrefix="rpt-gran"
            options={[
              { value: 'auto', label: t('ops.rpt.gran.auto') },
              ...REPORT_GRANULARITIES.map((g) => ({ value: g, label: t(`ops.rpt.gran.${g}`) })),
            ]}
          />
        </div>
      </div>

      {usesBasis ? (
        <div className={field}>
          <p className={legend}>{t('ops.rpt.f.basis')}</p>
          <ChoiceTabs
            label={t('ops.rpt.f.basis')}
            value={view.basis}
            onChange={(v) => onChange({ basis: v })}
            testIdPrefix="rpt-basis"
            options={BASES.map((b) => ({ value: b, label: t(`ops.rpt.basis.${b}`) }))}
          />
          <p className="text-xs text-muted-foreground">{t(`ops.rpt.basisHint.${view.basis}`)}</p>
        </div>
      ) : null}

      {categories.length > 1 ? (
        <div className={field}>
          <p className={legend}>{t('ops.rpt.f.categories')}</p>
          <ToggleChips
            label={t('ops.rpt.f.categories')}
            allLabel={t('ops.rpt.f.allCategories')}
            value={view.categories}
            onChange={(v) => onChange({ cat: v.join(',') })}
            testIdPrefix="rpt-cat"
            options={categories.map((c) => ({ value: c.code, label: c.name }))}
          />
        </div>
      ) : null}
    </div>
  );
}
