import { useI18n } from '@carrental/i18n/react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export interface FilterChip<K extends string = string> {
  key: K;
  label: string;
}

/** The filters currently applied to a list, each removable in one click. Renders nothing when empty. */
export function FilterChips<K extends string>({
  chips,
  onRemove,
}: {
  chips: FilterChip<K>[];
  onRemove: (key: K) => void;
}) {
  const { t } = useI18n();
  if (!chips.length) return null;
  return (
    <ul
      className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5"
      aria-label={t('ops.search.filters')}
    >
      {chips.map((c) => (
        <li key={c.key}>
          <Badge variant="secondary" className="gap-1 py-1 ps-2.5 pe-1 text-xs font-medium">
            {c.label}
            <button
              type="button"
              onClick={() => onRemove(c.key)}
              aria-label={t('ops.search.removeFilter', { name: c.label })}
              className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
