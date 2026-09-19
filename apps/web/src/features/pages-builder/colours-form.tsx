import { useI18n } from '@carrental/i18n/react';
import {
  hexToHslTriple,
  hslTripleToHex,
  PRESETS,
  validateBrandConfig,
  type BrandConfig,
} from '@carrental/theme';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { clone } from './builder-model';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useDraftBranding } from '@/lib/branding-hooks';
import { cn } from '@/lib/utils';

const TOKENS = [
  'primary',
  'primaryForeground',
  'background',
  'foreground',
  'accent',
  'accentForeground',
  'ring',
] as const;

/**
 * Quick colour changes made while looking at the page. The colours are the site's real branding
 * config, so saving here creates a branding draft (reviewed and published like any other); the
 * full editor is the Branding page.
 */
export function ColoursForm({
  value,
  published,
  disabled,
  onChange,
  onSaved,
}: {
  value: BrandConfig | null;
  published: BrandConfig | null;
  disabled: boolean;
  onChange: (b: BrandConfig) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const draft = useDraftBranding();
  const [note, setNote] = useState('');

  if (!value) return <Skeleton className="h-40 rounded-lg" />;
  const violations = validateBrandConfig(value);
  const setToken = (token: (typeof TOKENS)[number], hex: string) => {
    const triple = hexToHslTriple(hex);
    if (!triple) return;
    onChange({
      ...value,
      colors: { ...value.colors, light: { ...value.colors.light, [token]: triple } },
    });
  };
  const active = PRESETS.find(
    (p) => JSON.stringify(p.config.colors) === JSON.stringify(value.colors),
  );
  const unchanged = !published || JSON.stringify(published.colors) === JSON.stringify(value.colors);

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('ops.pages.coloursHint')}</p>
      <div className="space-y-2">
        <Label>{t('ops.pages.colourPreset')}</Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={active?.id === p.id}
              title={p.description}
              onClick={() => onChange({ ...value, colors: clone(p.config.colors) })}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:border-primary disabled:opacity-50',
                active?.id === p.id && 'border-primary bg-primary/5',
              )}
            >
              <span
                className="size-3.5 rounded-full border"
                style={{ background: hslTripleToHex(p.config.colors.light.primary) }}
              />
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOKENS.map((token) => (
          <label key={token} className="flex items-center gap-2.5">
            <input
              type="color"
              aria-label={t(`ops.pages.colourToken.${token}`)}
              value={hslTripleToHex(value.colors.light[token])}
              onChange={(e) => setToken(token, e.target.value)}
              className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {t(`ops.pages.colourToken.${token}`)}
            </span>
          </label>
        ))}
      </div>
      {violations.length ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{t('ops.pages.coloursContrast')}</p>
            <ul className="mt-1 list-disc ps-4 text-xs">
              {violations.slice(0, 4).map((v) => (
                <li key={`${v.mode}-${v.fg}-${v.bg}`}>
                  {v.mode}: {v.fg} on {v.bg} — {v.ratio}:1
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('ops.pages.notePlaceholder')}
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={violations.length > 0 || unchanged}
          loading={draft.isPending}
          onClick={async () => {
            try {
              await draft.mutateAsync({ payload: value, note: note.trim() || undefined });
              toast.success(t('ops.pages.colourSaved'));
              setNote('');
              onSaved();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t('ops.pages.draftFail'));
            }
          }}
        >
          {t('ops.pages.coloursSave')}
        </Button>
        {published ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={unchanged}
            onClick={() => onChange(clone(published))}
          >
            {t('ops.pages.colourReset')}
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link to="/config/branding">{t('ops.pages.editColoursLink')}</Link>
        </Button>
      </div>
    </fieldset>
  );
}
