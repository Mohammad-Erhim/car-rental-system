import { useI18n } from '@carrental/i18n/react';
import { Button, cn } from '@carrental/ui';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Globe } from 'lucide-react';

/**
 * EL-SH-001 — Language. Names the current language (not flag-only); applying preserves the
 * current task/data/focus (handled by I18nProvider). The list is the runtime set of enabled
 * locales (`useI18n().locales`, fed from `/meta/locales`) — a language added from the dashboard
 * appears here with no code change.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, locales, t } = useI18n();
  const current = locales.find((l) => l.code === locale) ?? locales[0];

  if (locales.length < 2) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-2', className)}
          aria-label={t('lang.switcher.current', { name: current?.nativeName ?? locale })}
        >
          <Globe className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{current?.nativeName ?? locale}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t('lang.switcher.label')}
          </DropdownMenu.Label>
          {locales.map((def) => (
            <DropdownMenu.Item
              key={def.code}
              onSelect={() => setLocale(def.code)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
            >
              <span>
                {def.nativeName}
                <span className="ms-2 text-xs text-muted-foreground">{def.englishName}</span>
              </span>
              {def.code === locale && <Check className="size-4" aria-hidden="true" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
