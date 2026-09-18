import {
  CONSENT_CATEGORIES,
  zConsentConfig,
  type ConsentCategory,
  type ConsentConfig,
} from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { clone, issueLines, localizedGet, newCookieRow } from './consent-model';
import { LocalizedField } from './localized-field';

import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { StateSwitcher } from '@/components/state-switcher';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { useDraftConsent } from '@/lib/consent-hooks';
import { FormMessageError } from '@/lib/use-form-submit';

/**
 * Edit the whole consent configuration — banner, the four categories and the cookie declaration —
 * and save it as one draft revision. Text is edited one language at a time (the switcher at the
 * top); a language left empty falls back to English on the site. The whole config is checked with
 * the API's own schema on save.
 */
export function ConsentSheet({
  base,
  locales,
  open,
  onOpenChange,
  onSaved,
}: {
  base: ConsentConfig;
  locales: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const draft = useDraftConsent();
  const [locale, setLocale] = useState('en');
  const defaults = clone(base) as ConsentConfig & { note?: string };
  defaults.note = '';
  const form = useForm<ConsentConfig & { note?: string }>({ defaultValues: defaults });
  const cookies = useFieldArray({ control: form.control, name: 'cookieTable' });
  const cfg = form.watch();
  const set = form.setValue;
  const dirty = { shouldDirty: true } as const;
  const catLabel = (id: ConsentCategory) => t(`ops.consent.cat.${id}`);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      size="lg"
      title={t('ops.consent.editTitle')}
      description={t('ops.consent.sheetHint')}
      submitLabel={t('ops.consent.saveDraft')}
      onSubmit={async (v) => {
        const { note, ...config } = v;
        const incomplete = config.cookieTable.findIndex(
          (r) =>
            !r.name.trim() ||
            !r.provider.trim() ||
            !r.duration.trim() ||
            !localizedGet(r.purpose, 'en').trim(),
        );
        if (incomplete >= 0) {
          throw new FormMessageError(t('ops.consent.cookieIncomplete', { n: incomplete + 1 }));
        }
        const parsed = zConsentConfig.safeParse(config);
        if (!parsed.success) throw new FormMessageError(issueLines(parsed.error.issues).join('\n'));
        await draft.mutateAsync({ payload: parsed.data, note: note?.trim() || undefined });
        toast.success(t('ops.consent.draftSaved2'));
        onSaved();
      }}
    >
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <StateSwitcher
          label={t('ops.tpl.languages')}
          value={locale}
          onChange={setLocale}
          testIdPrefix="consent-locale"
          options={locales.map((l) => ({ value: l, label: l.toUpperCase() }))}
        />
        {locale !== 'en' ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('ops.consent.localeFallbackHint')}
          </p>
        ) : null}
      </div>

      <FormSection title={t('ops.consent.banner')}>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="consent-enabled">{t('ops.consent.enabled')}</Label>
            <p className="text-xs text-muted-foreground">{t('ops.consent.enabledHint')}</p>
          </div>
          <Switch
            id="consent-enabled"
            checked={cfg.enabled}
            onCheckedChange={(v) => set('enabled', v, dirty)}
            data-testid="consent-enabled"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="consent-policy">{t('ops.consent.policyVersion')}</Label>
            <Input
              id="consent-policy"
              inputMode="numeric"
              value={String(cfg.policyVersion)}
              onChange={(e) =>
                set(
                  'policyVersion',
                  Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1),
                  dirty,
                )
              }
            />
            <p className="text-[0.8rem] text-muted-foreground">
              {t('ops.consent.policyVersionHint')}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('ops.consent.layout')}</Label>
            <Select
              value={cfg.layout.position}
              onValueChange={(v) =>
                set('layout.position', v as ConsentConfig['layout']['position'], dirty)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">{t('ops.consent.layout.bar')}</SelectItem>
                <SelectItem value="card">{t('ops.consent.layout.card')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox
            checked={cfg.layout.showRejectAll}
            onCheckedChange={(v) => set('layout.showRejectAll', v === true, dirty)}
          />
          {t('ops.consent.showRejectAll')}
        </label>
        <LocalizedField
          id="consent-title"
          label={t('ops.consent.bannerTitle')}
          value={cfg.text.bannerTitle}
          locale={locale}
          max={120}
          onChange={(v) => set('text.bannerTitle', v, dirty)}
        />
        <LocalizedField
          id="consent-body"
          label={t('ops.consent.bannerBody')}
          value={cfg.text.bannerBody}
          locale={locale}
          multiline
          max={600}
          onChange={(v) => set('text.bannerBody', v, dirty)}
        />
        <LocalizedField
          id="consent-intro"
          label={t('ops.consent.prefsIntro')}
          value={cfg.text.prefsIntro}
          locale={locale}
          multiline
          max={600}
          onChange={(v) => set('text.prefsIntro', v, dirty)}
        />
      </FormSection>

      <FormSection title={t('ops.consent.categories')}>
        {CONSENT_CATEGORIES.map((id) => {
          const i = cfg.categories.findIndex((c) => c.id === id);
          const cat = cfg.categories[i];
          if (!cat) return null;
          const locked = id === 'necessary';
          return (
            <div key={id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{catLabel(id)}</span>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={locked ? true : cat.shown}
                      disabled={locked}
                      onCheckedChange={(v) => set(`categories.${i}.shown`, v === true, dirty)}
                    />
                    {t('ops.consent.shown')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={locked ? true : cat.defaultOn}
                      disabled={locked}
                      onCheckedChange={(v) => set(`categories.${i}.defaultOn`, v === true, dirty)}
                    />
                    {t('ops.consent.defaultOn')}
                  </label>
                </div>
              </div>
              <LocalizedField
                id={`cat-name-${id}`}
                label={t('ops.consent.catName')}
                value={cat.name}
                locale={locale}
                max={60}
                onChange={(v) => set(`categories.${i}.name`, v, dirty)}
              />
              <LocalizedField
                id={`cat-desc-${id}`}
                label={t('ops.consent.catDescription')}
                value={cat.description}
                locale={locale}
                multiline
                max={400}
                onChange={(v) => set(`categories.${i}.description`, v, dirty)}
              />
            </div>
          );
        })}
      </FormSection>

      <FormSection title={t('ops.consent.cookieTable')} hint={t('ops.consent.cookieHint')}>
        {cookies.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('ops.consent.noRows')}</p>
        ) : null}
        {cookies.fields.map((f, i) => {
          const row = cfg.cookieTable[i];
          if (!row) return null;
          return (
            <div key={f.id} className="space-y-3 rounded-lg border p-4" data-testid="cookie-row">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('ops.consent.removeRow')}
                  onClick={() => cookies.remove(i)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`ck-name-${f.id}`}>{t('ops.consent.col.name')}</Label>
                  <Input
                    id={`ck-name-${f.id}`}
                    value={row.name}
                    onChange={(e) => set(`cookieTable.${i}.name`, e.target.value, dirty)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ck-prov-${f.id}`}>{t('ops.consent.col.provider')}</Label>
                  <Input
                    id={`ck-prov-${f.id}`}
                    value={row.provider}
                    onChange={(e) => set(`cookieTable.${i}.provider`, e.target.value, dirty)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('site.cookie.table.category')}</Label>
                  <Select
                    value={row.category}
                    onValueChange={(v) =>
                      set(`cookieTable.${i}.category`, v as ConsentCategory, dirty)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONSENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {catLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ck-dur-${f.id}`}>{t('ops.consent.col.duration')}</Label>
                  <Input
                    id={`ck-dur-${f.id}`}
                    value={row.duration}
                    onChange={(e) => set(`cookieTable.${i}.duration`, e.target.value, dirty)}
                  />
                </div>
              </div>
              <LocalizedField
                id={`ck-purpose-${f.id}`}
                label={t('site.cookie.table.purpose')}
                value={row.purpose}
                locale={locale}
                max={200}
                onChange={(v) => set(`cookieTable.${i}.purpose`, v, dirty)}
              />
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cookies.append(newCookieRow())}
          data-testid="consent-add-cookie"
        >
          <Plus aria-hidden="true" />
          {t('ops.consent.addRow')}
        </Button>
      </FormSection>

      <FormSection title={t('ops.consent.note')}>
        <div className="space-y-1.5">
          <Label htmlFor="consent-note" className="sr-only">
            {t('ops.consent.notePlaceholder')}
          </Label>
          <Textarea
            id="consent-note"
            rows={2}
            placeholder={t('ops.consent.notePlaceholder')}
            value={cfg.note ?? ''}
            onChange={(e) => set('note', e.target.value, dirty)}
          />
        </div>
      </FormSection>
    </FormSheet>
  );
}
