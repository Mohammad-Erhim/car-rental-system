import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Briefcase,
  Car,
  DoorClosed,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CategoryView } from '@/lib/admin-hooks';
import { cn } from '@/lib/utils';

/** The category's picture, or a car glyph when it has none. `className` sets the size. */
export function CategoryThumb({ c, className }: { c: CategoryView; className: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-md border bg-muted',
        className,
      )}
    >
      {c.imageUrl ? (
        <img src={c.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Car className="size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

/** Passengers · luggage · doors · transmission, in one compact line. */
export function CategorySpecs({ c }: { c: CategoryView }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-muted-foreground">
      <span className="inline-flex items-center gap-1" title={t('ops.cat.passengers')}>
        <Users className="size-3.5" aria-hidden="true" />
        {c.passengers}
      </span>
      <span className="inline-flex items-center gap-1" title={t('ops.cat.luggage')}>
        <Briefcase className="size-3.5" aria-hidden="true" />
        {c.luggage}
      </span>
      <span className="inline-flex items-center gap-1" title={t('ops.cat.doors')}>
        <DoorClosed className="size-3.5" aria-hidden="true" />
        {c.doors}
      </span>
      <span>{t(c.transmission === 'manual' ? 'ops.cat.manual' : 'ops.cat.automatic')}</span>
    </span>
  );
}

/** Row menu shared by categories and features; renders nothing without `catalogue.manage`. */
export function RowActions({
  active,
  onEdit,
  onDeactivate,
  onRestore,
}: {
  active: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
}) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  if (!hasPermission('catalogue.manage')) return null;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden="true" />
            {t('ops.cat.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {active ? (
            <DropdownMenuItem
              onSelect={onDeactivate}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              {t('ops.cat.deactivate')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onRestore}>
              <RotateCcw aria-hidden="true" />
              {t('ops.cat.restore')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
