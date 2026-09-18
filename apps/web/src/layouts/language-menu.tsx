import { useI18n } from '@carrental/i18n/react';
import { Check, Globe } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Language switcher. The list is the runtime set of enabled locales (`useI18n().locales`, fed
 * from `/meta/locales`), so a language added from the dashboard appears with no code change.
 * Names the current language in text, never flag-only.
 */
export function LanguageMenu({ showName = false }: { showName?: boolean }) {
  const { locale, setLocale, locales, t } = useI18n();
  const current = locales.find((l) => l.code === locale) ?? locales[0];

  if (locales.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={showName ? 'sm' : 'icon-sm'}
          aria-label={t('lang.switcher.current', { name: current?.nativeName ?? locale })}
        >
          <Globe aria-hidden="true" />
          {showName ? <span>{current?.nativeName ?? locale}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t('lang.switcher.label')}
        </DropdownMenuLabel>
        {locales.map((def) => (
          <DropdownMenuItem
            key={def.code}
            onSelect={() => setLocale(def.code)}
            className="justify-between gap-4"
          >
            <span>
              {def.nativeName}
              <span className="ms-2 text-xs text-muted-foreground">{def.englishName}</span>
            </span>
            {def.code === locale ? <Check className="text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
