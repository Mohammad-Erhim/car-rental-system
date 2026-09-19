import type { Block, PageKey } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

import { BLOCK_DEFS } from './block-defs';

import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The page's blocks, top to bottom. Select one to edit it; reorder, hide or delete from its row.
 * The search card on the home page is required, so it can be neither hidden nor deleted there —
 * on any other page it is a block like the rest.
 */
export function BlocksPanel({
  blocks,
  page,
  selectedId,
  canEdit,
  onSelect,
  onMove,
  onToggleHidden,
  onDelete,
  onAdd,
}: {
  blocks: Block[];
  page: PageKey;
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <SectionCard
      title={t('ops.pages.blocksPanel')}
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={onAdd}
          data-testid="pages-add-block"
        >
          <Plus aria-hidden="true" />
          {t('ops.pages.addBlock')}
        </Button>
      }
      contentClassName="p-3 pt-0"
    >
      <ul className="space-y-1.5" data-testid="pages-blocks">
        {blocks.map((b, i) => {
          const def = BLOCK_DEFS[b.type];
          const requiredHere = def.required && page === 'home';
          const selected = b.id === selectedId;
          return (
            <li
              key={b.id}
              className={cn(
                'flex items-center rounded-lg border pe-1 transition-colors',
                selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50',
                b.hidden && 'opacity-60',
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(b.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <def.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-medium">{t(def.label)}</span>
                {requiredHere ? <span className="text-xs text-muted-foreground">*</span> : null}
              </button>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canEdit || i === 0}
                  aria-label={t('ops.pages.moveUp')}
                  onClick={() => onMove(b.id, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canEdit || i === blocks.length - 1}
                  aria-label={t('ops.pages.moveDown')}
                  onClick={() => onMove(b.id, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canEdit || requiredHere}
                  aria-label={t(b.hidden ? 'ops.pages.show' : 'ops.pages.hide')}
                  onClick={() => onToggleHidden(b.id)}
                >
                  {b.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-destructive"
                  disabled={!canEdit || requiredHere}
                  aria-label={t('ops.pages.delete')}
                  onClick={() => onDelete(b.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
