import { useI18n } from '@carrental/i18n/react';
import type { BrandConfig } from '@carrental/theme';
import { brandConfigToVarMaps } from '@carrental/theme';
import type { CSSProperties } from 'react';

type Mode = 'light' | 'dark';

/**
 * How the chosen tokens look: a card with buttons and status pills (the dashboard) and a hero
 * with a call to action (the public site). It scopes the theme's CSS variables to itself, so
 * nothing else on the page changes until the draft is published.
 */
export function BrandPreview({ config, mode }: { config: BrandConfig; mode: Mode }) {
  const { t } = useI18n();
  const vars = brandConfigToVarMaps(config)[mode] as unknown as CSSProperties;
  const name = config.assets.wordmark || 'Car Rental';
  const muted = { color: 'hsl(var(--muted-foreground))' };
  const chip = (bg: string, fg: string) => ({
    background: bg,
    color: fg,
    borderRadius: 'var(--radius)',
  });

  return (
    <div
      style={vars}
      data-density={config.density}
      className={`space-y-3 rounded-lg border p-4 ${mode === 'dark' ? 'dark' : ''}`}
      data-testid="brand-preview"
    >
      <div
        className="p-3"
        style={{
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          borderRadius: 'var(--radius)',
          border: '1px solid hsl(var(--border))',
        }}
      >
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs" style={muted}>
          {t('ops.branding.previewBody')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span
            className="px-3 py-1.5 text-xs font-medium"
            style={chip('hsl(var(--primary))', 'hsl(var(--primary-foreground))')}
          >
            Primary
          </span>
          <span
            className="px-3 py-1.5 text-xs font-medium"
            style={chip('hsl(var(--accent))', 'hsl(var(--accent-foreground))')}
          >
            Accent
          </span>
          {(['destructive', 'success', 'warning'] as const).map((s) => (
            <span
              key={s}
              className="px-2 py-1 text-[11px] font-medium capitalize"
              style={{
                background: `hsl(var(--${s}) / 0.15)`,
                color: `hsl(var(--${s}))`,
                borderRadius: 'calc(var(--radius) - 3px)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide" style={muted}>
          {t('ops.branding.publicSitePreview')}
        </p>
        <div
          className="p-4"
          style={{
            borderRadius: 'var(--radius)',
            backgroundImage:
              'linear-gradient(135deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary)) 55%, hsl(var(--ring) / 0.8) 100%)',
            color: 'hsl(var(--primary-foreground))',
          }}
        >
          <p className="text-sm font-bold">{name}</p>
          <p className="mt-0.5 text-[11px] opacity-80">{t('ops.branding.previewBody')}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: 'hsl(var(--primary-foreground))',
                color: 'hsl(var(--primary))',
                borderRadius: 'calc(var(--radius) - 3px)',
              }}
            >
              Search
            </span>
            <span
              className="px-2.5 py-1 text-[11px] font-medium"
              style={{
                border: '1px solid hsl(var(--primary-foreground) / 0.4)',
                borderRadius: 'calc(var(--radius) - 3px)',
              }}
            >
              Fleet
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
