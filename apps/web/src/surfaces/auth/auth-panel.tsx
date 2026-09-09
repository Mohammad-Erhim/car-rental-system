import { useI18n } from '@carrental/i18n/react';
import { LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Full-height split auth panel for the operations console — a branded column on the left, the
 * form on the right. Used by the staff sign-in and recovery screens (design §7.1). Collapses to
 * a single column below `md`.
 */
export function AuthPanel({
  icon,
  title,
  subtitle,
  children,
  footer,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-[34rem] md:grid-cols-2">
        {/* brand column */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground md:flex">
          <div
            className="pointer-events-none absolute -end-16 -top-16 size-64 rounded-full bg-primary-foreground/10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -start-10 size-72 rounded-full bg-primary-foreground/5"
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-2 text-sm font-semibold text-primary-foreground/90">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15">
              <LayoutDashboard className="size-4" aria-hidden="true" />
            </span>
            {t('app.name')}
          </div>
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight">{t('app.ops.name')}</h2>
            <p className="mt-3 max-w-xs text-sm text-primary-foreground/80">
              {t('auth.opsPanelBody')}
            </p>
          </div>
          <p className="relative text-xs text-primary-foreground/70">
            © {new Date().getFullYear()} {t('app.name')}
          </p>
        </div>

        {/* form column */}
        <div className="flex flex-col justify-center p-6 sm:p-10">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6">
              <span
                className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary md:hidden"
                aria-hidden="true"
              >
                {icon}
              </span>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
            {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
