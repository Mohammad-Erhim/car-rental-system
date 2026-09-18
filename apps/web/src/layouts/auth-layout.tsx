import { useI18n } from '@carrental/i18n/react';
import {
  BarChart3,
  CarFront,
  ClipboardList,
  LayoutDashboard,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Outlet } from 'react-router-dom';

import { LanguageMenu } from './language-menu';
import { ThemeMenu } from './theme-menu';

const HIGHLIGHTS: Array<{ icon: LucideIcon; labelKey: string }> = [
  { icon: ClipboardList, labelKey: 'ops.nav.reservations' },
  { icon: CarFront, labelKey: 'ops.nav.fleet' },
  { icon: Wallet, labelKey: 'ops.nav.finance' },
  { icon: BarChart3, labelKey: 'ops.nav.reports' },
];

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={`grid size-10 place-items-center rounded-xl bg-primary-foreground/15 text-primary-foreground ring-1 ring-inset ring-primary-foreground/20 ${className ?? ''}`}
    >
      <LayoutDashboard className="size-5" aria-hidden="true" />
    </span>
  );
}

/**
 * Two-column shell for signed-out screens (sign-in, recovery, …): a branded panel beside the form
 * from `lg`, collapsing to a compact brand bar above the form on smaller screens. The routed
 * page renders only its form card — this layout owns the chrome, language and theme controls.
 */
export function AuthLayout() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background lg:grid-rows-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* brand panel */}
      <aside className="relative isolate flex flex-col justify-between overflow-hidden bg-primary p-6 text-primary-foreground sm:p-8 lg:p-12">
        {/* decorative layers */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_100%_-10%,hsl(var(--primary-foreground)/0.18),transparent_60%),radial-gradient(40rem_30rem_at_-10%_110%,hsl(var(--primary-foreground)/0.12),transparent_60%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(hsl(var(--primary-foreground))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary-foreground))_1px,transparent_1px)] [background-size:2.5rem_2.5rem] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />

        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">{t('app.name')}</span>
        </div>

        <div className="hidden max-w-md py-12 lg:block">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">{t('app.ops.name')}</h2>
          <p className="mt-4 text-base text-primary-foreground/80">{t('auth.opsPanelBody')}</p>
          <ul className="mt-10 grid grid-cols-2 gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, labelKey }) => (
              <li
                key={labelKey}
                className="flex items-center gap-3 rounded-xl bg-primary-foreground/10 px-4 py-3 text-sm font-medium ring-1 ring-inset ring-primary-foreground/15 backdrop-blur-sm"
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t(labelKey)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-primary-foreground/70 lg:block">
          © {new Date().getFullYear()} {t('app.name')}
        </p>
      </aside>

      {/* form column */}
      <div className="relative flex min-w-0 flex-col">
        <div className="flex items-center justify-end gap-1 p-4 sm:p-6">
          <ThemeMenu />
          <LanguageMenu showName />
        </div>
        <main
          id="ops-main"
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-12 sm:px-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
