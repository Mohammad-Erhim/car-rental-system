import { useI18n } from '@carrental/i18n/react';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { NavGroup } from './nav-config';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/**
 * Command palette (⌘K / Ctrl+K). Lists the same permission-filtered destinations as the sidebar,
 * so it can never route a user somewhere they cannot open. Filtering + keyboard handling are
 * cmdk's; this component only supplies items and navigates.
 */
export function CommandMenu({ groups }: { groups: NavGroup[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = useMemo(
    () =>
      groups.map((g) => ({
        heading: g.titleKey ? t(g.titleKey) : undefined,
        key: g.titleKey ?? 'top',
        items: g.items,
      })),
    [groups, t],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="cmdk-open"
        aria-keyshortcuts="Meta+K Control+K"
        aria-label={t('ops.cmdk.open')}
        className="h-9 w-9 justify-center px-0 text-muted-foreground lg:w-56 lg:justify-start lg:px-3 2xl:w-64"
      >
        <Search aria-hidden="true" />
        <span className="hidden flex-1 text-start font-normal lg:inline">{t('ops.cmdk.open')}</span>
        <kbd
          dir="ltr"
          className="hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium lg:inline"
        >
          ⌘K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t('ops.cmdk.open')}
        description={t('ops.cmdk.hint')}
        closeLabel={t('action.close')}
      >
        <CommandInput placeholder={t('ops.cmdk.placeholder')} data-testid="cmdk-input" />
        <CommandList data-testid="cmdk-results">
          <CommandEmpty>{t('ops.cmdk.empty')}</CommandEmpty>
          {sections.map((s) => (
            <CommandGroup key={s.key} heading={s.heading}>
              {s.items.map((it) => (
                <CommandItem
                  key={it.to}
                  value={`${t(it.label)} ${s.heading ?? ''}`.trim()}
                  data-testid={`cmdk-item-${it.to}`}
                  onSelect={() => {
                    setOpen(false);
                    navigate(it.to);
                  }}
                >
                  <it.icon aria-hidden="true" />
                  <span className="truncate">{t(it.label)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
