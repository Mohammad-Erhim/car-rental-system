import { useI18n } from '@carrental/i18n/react';
import { LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Split auth panel for the operations console — a branded gradient column beside the form on
 * `md+`, stacked as a gradient header above the form on mobile (so the screen never reads as a
 * lone white card). Used by the staff sign-in and recovery screens (design §7.1).
 */
export function AuthPanel({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-gradient-to-br from-primary/5 to-transparent">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-[34rem] md:grid-cols-2">
        {/* brand — left column on md+, gradient header on mobile */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground sm:p-8 md:p-10">
          <div
            className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-primary-foreground/10 md:size-64"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -start-10 hidden size-72 rounded-full bg-primary-foreground/5 md:block"
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-2 text-sm font-semibold text-primary-foreground/90">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15">
              <LayoutDashboard className="size-4" aria-hidden="true" />
            </span>
            {t('app.name')}
          </div>
          <div className="relative mt-6 md:mt-0">
            <h2 className="text-2xl font-bold leading-tight md:text-3xl">{t('app.ops.name')}</h2>
            <p className="mt-2 max-w-xs text-sm text-primary-foreground/80 md:mt-3">
              {t('auth.opsPanelBody')}
            </p>
          </div>
          <p className="relative mt-6 hidden text-xs text-primary-foreground/70 md:mt-0 md:block">
            © {new Date().getFullYear()} {t('app.name')}
          </p>
        </div>

        {/* form column */}
        <div className="flex flex-col justify-center p-6 sm:p-10">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6">
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
