import { getLocaleDefinition, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import { Button, cn } from '@carrental/ui';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Globe } from 'lucide-react';

/**
 * EL-SH-001 — Language. Names the current language (not flag-only); applying preserves the
 * current task/data/focus (handled by I18nProvider). Uses a menu for the small locale set.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const current = getLocaleDefinition(locale);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-2', className)}
          aria-label={t('lang.switcher.current', { name: current.nativeName })}
        >
          <Globe className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{current.nativeName}</span>
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
          {SUPPORTED_LOCALE_CODES.map((code) => {
            const def = getLocaleDefinition(code);
            return (
              <DropdownMenu.Item
                key={code}
                onSelect={() => setLocale(code)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
              >
                <span>
                  {def.nativeName}
                  <span className="ms-2 text-xs text-muted-foreground">{def.englishName}</span>
                </span>
                {code === locale && <Check className="size-4" aria-hidden="true" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
