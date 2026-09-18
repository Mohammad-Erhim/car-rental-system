import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { ChevronsUpDown, LogOut } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Signed-in staff identity + sign-out. `variant="full"` shows the name (sidebar footer). */
export function UserMenu({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const { t } = useI18n();
  const { actor, signOut } = useAuth();
  if (!actor) return null;

  const org = actor.organizationId ? (actor.organizationName ?? t('ops.header.org')) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            variant === 'full'
              ? 'h-auto w-full justify-start gap-3 p-2'
              : 'size-9 rounded-full p-0',
          )}
          aria-label={actor.displayName}
        >
          <Avatar className={variant === 'full' ? 'size-9' : 'size-8'}>
            <AvatarFallback>{initials(actor.displayName)}</AvatarFallback>
          </Avatar>
          {variant === 'full' ? (
            <>
              <span className="min-w-0 flex-1 text-start leading-tight">
                <span className="block truncate text-sm font-medium">{actor.displayName}</span>
                {org ? (
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {org}
                  </span>
                ) : null}
              </span>
              <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{actor.displayName}</p>
          {org ? <p className="truncate text-xs text-muted-foreground">{org}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void signOut()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut aria-hidden="true" />
          {t('action.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
