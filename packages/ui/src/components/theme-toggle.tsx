import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, MoonStar, Sun } from 'lucide-react';
import type { ComponentType } from 'react';

import { cn } from '../lib/utils.js';
import { useTheme, type Theme } from '../providers/theme-provider.js';
import { Button } from './button.js';

const OPTIONS: Array<{ value: Theme; Icon: ComponentType<{ className?: string }> }> = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: MoonStar },
  { value: 'system', Icon: Monitor },
];

export interface ThemeToggleProps {
  className?: string;
  /** Localised labels — pass `t('theme.light')` etc. Falls back to English. */
  labels?: Partial<Record<Theme | 'label' | 'current', string>>;
}

/**
 * Light / Dark / System switch (SRS-UI-002, WCAG 2.2). Menu, not a bare cycle button, so the
 * choices are announced. Applies immediately via `ThemeProvider`.
 */
export function ThemeToggle({ className, labels = {} }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const l = (k: Theme | 'label' | 'current', fallback: string) => labels[k] ?? fallback;
  const ActiveIcon = (OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]!).Icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(className)}
          aria-label={l(
            'current',
            `Theme: ${theme}${theme === 'system' ? ` (${resolvedTheme})` : ''}. Change theme`,
          )}
        >
          <ActiveIcon className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[9rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {l('label', 'Theme')}
          </DropdownMenu.Label>
          {OPTIONS.map(({ value, Icon }) => (
            <DropdownMenu.Item
              key={value}
              onSelect={() => setTheme(value)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm capitalize outline-none focus:bg-accent focus:text-accent-foreground"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {l(value, value)}
              </span>
              {theme === value && <Check className="size-4" aria-hidden="true" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
