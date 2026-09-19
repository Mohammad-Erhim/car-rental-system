import type { Localized } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { ArrowDown, ArrowUp, Maximize2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';

import { ICON_OPTIONS, type FieldDef } from './block-defs';
import { emptyItem, isLocalized, swap } from './builder-model';

import { LocalizedField } from '@/components/localized-field';
import { Button } from '@/components/ui/button';
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
import { localizedGet, localizedSet } from '@/lib/localized';

type Upload = (file: File, cb: (ref: string, w: number | null, h: number | null) => void) => void;

const ACCEPT = 'image/png,image/jpeg,image/webp';

/** A labelled control for one field of a block; lists and links render their own sub-fields. */
export function FieldControl({
  def,
  value,
  locale,
  assetUrls,
  uploading,
  onChange,
  onUpload,
  onExpand,
  idPrefix = 'f',
}: {
  def: FieldDef;
  value: unknown;
  locale: string;
  assetUrls: Record<string, string>;
  uploading: boolean;
  onChange: (v: unknown) => void;
  onUpload: Upload;
  onExpand: (url: string) => void;
  idPrefix?: string;
}) {
  const { t } = useI18n();
  const id = `${idPrefix}-${def.key}`;
  const label = (
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={id}>{t(def.label)}</Label>
      {def.hint ? <span className="text-xs text-muted-foreground">{t(def.hint)}</span> : null}
    </div>
  );

  if (def.kind === 'ltext' || def.kind === 'larea') {
    return (
      <LocalizedField
        id={id}
        label={t(def.label)}
        value={isLocalized(value) ? value : undefined}
        locale={locale}
        multiline={def.kind === 'larea'}
        onChange={onChange}
      />
    );
  }

  if (def.kind === 'text') {
    return (
      <div className="space-y-1.5">
        {label}
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          maxLength={def.max}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (def.kind === 'num') {
    return (
      <div className="space-y-1.5">
        {label}
        <Input
          id={id}
          type="number"
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          value={typeof value === 'number' ? value : (def.min ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (def.kind === 'bool') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor={id}>{t(def.label)}</Label>
        <Switch id={id} checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }

  if (def.kind === 'select' || def.kind === 'icon') {
    const options = def.kind === 'icon' ? ICON_OPTIONS : (def.options ?? []);
    return (
      <div className="space-y-1.5">
        {label}
        <Select value={typeof value === 'string' ? value : options[0]} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (def.kind === 'link') {
    const lv = (value ?? null) as { label?: Localized; href?: string } | null;
    return (
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t(def.label)}</legend>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-label`}>{t('ops.pages.field.label')}</Label>
          <Input
            id={`${id}-label`}
            dir="auto"
            value={localizedGet(lv?.label, locale)}
            onChange={(e) =>
              onChange({ ...(lv ?? {}), label: localizedSet(lv?.label, locale, e.target.value) })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-href`}>{t('ops.pages.field.href')}</Label>
          <Input
            id={`${id}-href`}
            value={lv?.href ?? ''}
            placeholder="#book · /en/search · https://…"
            onChange={(e) => onChange({ ...(lv ?? { label: { en: '' } }), href: e.target.value })}
          />
        </div>
      </fieldset>
    );
  }

  if (def.kind === 'asset') {
    const ref = typeof value === 'string' ? value : null;
    const url =
      ref && ref !== 'obj:placeholder'
        ? (assetUrls[ref] ?? (ref.startsWith('http') ? ref : null))
        : null;
    const pick = (f: File | undefined) => {
      if (f) onUpload(f, (r) => onChange(r));
    };
    return (
      <div className="space-y-1.5">
        {label}
        {url ? (
          <div className="flex items-center gap-3 rounded-lg border p-2">
            <img src={url} alt="" className="h-16 w-24 rounded-md border object-cover" />
            <div className="flex flex-col items-start gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => onExpand(url)}>
                <Maximize2 aria-hidden="true" />
                {t('ops.pages.asset.expand')}
              </Button>
              <Button type="button" size="sm" variant="ghost" asChild>
                <label className="cursor-pointer">
                  <RefreshCw aria-hidden="true" />
                  {t('ops.pages.asset.replace')}
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      pick(f);
                    }}
                  />
                </label>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(def.key === 'src' ? 'obj:placeholder' : null)}
              >
                <Trash2 aria-hidden="true" />
                {t('ops.pages.asset.remove')}
              </Button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted/40">
            <Upload className="size-4" aria-hidden="true" />
            {uploading ? t('ops.pages.asset.uploading') : t('ops.pages.asset.upload')}
            <input
              id={id}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                pick(f);
              }}
            />
          </label>
        )}
      </div>
    );
  }

  if (def.kind === 'list') {
    const arr = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    const setItem = (i: number, patch: Record<string, unknown>) =>
      onChange(arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{t(def.label)}</p>
        {arr.map((it, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  aria-label={t('ops.pages.moveUp')}
                  onClick={() => onChange(swap(arr, i, i - 1))}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === arr.length - 1}
                  aria-label={t('ops.pages.moveDown')}
                  onClick={() => onChange(swap(arr, i, i + 1))}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-destructive"
                  aria-label={t('action.remove')}
                  onClick={() => onChange(arr.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
            {def.itemFields?.map((sf) => (
              <FieldControl
                key={sf.key}
                def={sf}
                idPrefix={`${id}-${i}`}
                value={it[sf.key]}
                locale={locale}
                assetUrls={assetUrls}
                uploading={uploading}
                onExpand={onExpand}
                onUpload={onUpload}
                onChange={(v) => setItem(i, { [sf.key]: v })}
              />
            ))}
          </div>
        ))}
        {arr.length < (def.itemMax ?? 8) ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...arr, emptyItem(def.itemFields ?? [])])}
          >
            <Plus aria-hidden="true" />
            {t('ops.pages.addItem')}
          </Button>
        ) : null}
      </div>
    );
  }

  return null;
}
