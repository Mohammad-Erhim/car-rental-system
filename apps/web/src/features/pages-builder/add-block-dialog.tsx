import type { Block, BlockType } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';

import { BLOCK_DEFS, BLOCK_ORDER } from './block-defs';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Pick a block type to add. A singleton (one per page) that is already there is disabled. */
export function AddBlockDialog({
  blocks,
  onPick,
  open,
  onOpenChange,
}: {
  blocks: Block[];
  onPick: (type: BlockType) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('ops.pages.paletteTitle')}</DialogTitle>
          <DialogDescription>{t('ops.pages.paletteHint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {BLOCK_ORDER.map((type) => {
            const def = BLOCK_DEFS[type];
            const taken = def.singleton && blocks.some((b) => b.type === type);
            return (
              <button
                key={type}
                type="button"
                disabled={taken}
                onClick={() => onPick(type)}
                data-testid={`pages-add-${type}`}
                className="flex items-start gap-3 rounded-lg border p-3 text-start transition-colors hover:border-primary hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <def.Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{t(def.label)}</span>
                  <span className="block text-xs text-muted-foreground">{t(def.hint)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
