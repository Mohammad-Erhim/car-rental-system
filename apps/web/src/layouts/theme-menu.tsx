import { useI18n } from '@carrental/i18n/react';
import { useTheme, type Theme } from '@carrental/ui';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const OPTIONS: Array<{ value: Theme; icon: LucideIcon; labelKey: string }> = [
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
];

/** Light / dark / system. The theme itself is owned by the shared `ThemeProvider`. */
export function ThemeMenu() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const Active = (OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]!).icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('theme.current')}>
          <Active aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t('theme.label')}
        </DropdownMenuLabel>
        {OPTIONS.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <Icon aria-hidden="true" />
              {t(labelKey)}
            </span>
            {theme === value ? <Check className="text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
