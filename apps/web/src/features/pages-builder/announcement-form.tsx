import { zAnnouncement, type Announcement } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';

import { LocalizedField } from '@/components/localized-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const VARIANTS = ['info', 'success', 'warning', 'critical'] as const;

/** The site-wide announcement banner: message per language, look, optional link and dismissal. */
export function AnnouncementForm({
  value,
  locale,
  disabled,
  onChange,
}: {
  value: Announcement | null;
  locale: string;
  disabled: boolean;
  onChange: (a: Announcement | null) => void;
}) {
  const { t } = useI18n();
  const base: Announcement = value ?? zAnnouncement.parse({ message: { en: '' } });
  const set = (patch: Partial<Announcement>) => onChange({ ...base, ...patch });
  const ctaLabel = base.cta?.label;

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('ops.pages.announce.hint')}</p>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor="ann-enabled">{t('ops.pages.announce.enable')}</Label>
        <Switch
          id="ann-enabled"
          checked={base.enabled}
          onCheckedChange={(v) => set({ enabled: v })}
        />
      </div>
      <LocalizedField
        id="ann-message"
        label={t('ops.pages.announce.message')}
        value={base.message}
        locale={locale}
        max={200}
        onChange={(message) => set({ message })}
      />
      <div className="space-y-1.5">
        <Label>{t('ops.pages.announce.variant')}</Label>
        <Select
          value={base.variant}
          onValueChange={(v) => set({ variant: v as Announcement['variant'] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VARIANTS.map((v) => (
              <SelectItem key={v} value={v}>
                {t(`ops.pages.announce.variant.${v}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LocalizedField
          id="ann-cta-label"
          label={t('ops.pages.announce.ctaLabel')}
          value={ctaLabel}
          locale={locale}
          max={60}
          onChange={(label) => set({ cta: { label, href: base.cta?.href ?? '' } })}
        />
        <div className="space-y-1.5">
          <Label htmlFor="ann-cta-href">{t('ops.pages.announce.ctaHref')}</Label>
          <Input
            id="ann-cta-href"
            value={base.cta?.href ?? ''}
            placeholder="/en/search · https://…"
            onChange={(e) => {
              const href = e.target.value;
              if (!href && !localizedGetSafe(ctaLabel, locale)) return set({ cta: null });
              set({ cta: { label: base.cta?.label ?? { en: '' }, href } });
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor="ann-dismiss">{t('ops.pages.announce.dismissible')}</Label>
        <Switch
          id="ann-dismiss"
          checked={base.dismissible}
          onCheckedChange={(v) => set({ dismissible: v })}
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor="ann-sticky">{t('ops.pages.announce.sticky')}</Label>
        <Switch
          id="ann-sticky"
          checked={base.sticky}
          onCheckedChange={(v) => set({ sticky: v })}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="ann-id">{t('ops.pages.announce.campaignId')}</Label>
          <span className="text-xs text-muted-foreground">
            {t('ops.pages.announce.campaignIdHint')}
          </span>
        </div>
        <Input
          id="ann-id"
          value={base.id}
          maxLength={40}
          onChange={(e) =>
            set({ id: e.target.value.replace(/[^A-Za-z0-9._-]/g, '-') || 'announcement' })
          }
        />
      </div>
    </fieldset>
  );
}

function localizedGetSafe(v: Announcement['message'] | undefined, locale: string) {
  return (v as Record<string, string | undefined> | undefined)?.[locale] ?? '';
}
