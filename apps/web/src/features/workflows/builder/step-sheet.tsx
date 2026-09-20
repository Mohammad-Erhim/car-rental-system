import { useI18n } from '@carrental/i18n/react';
import { useState } from 'react';

import type { EditorStep } from './model';
import { ParallelFields, StepFields, type StepContext } from './step-fields';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * Edits one step in a side panel. Changes are held in a copy and applied with "Done", so closing the
 * panel discards a half-finished edit and the pipeline never shows a step mid-change.
 */
export function StepSheet({
  step,
  ctx,
  onApply,
  onClose,
}: {
  step: EditorStep;
  ctx: StepContext;
  onApply: (s: EditorStep) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EditorStep>(step);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('action.close')} className="p-0 sm:max-w-xl">
        <form
          className="flex h-full min-h-0 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onApply(draft);
          }}
        >
          <SheetHeader className="border-b p-6 pe-12">
            <SheetTitle>
              {t('ops.wfb.editTitle', { type: t(`ops.wf.stepType.${step.type}`) })}
            </SheetTitle>
            <SheetDescription>{t(`ops.wfb.typeHelp.${step.type}`)}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            {draft.type === 'parallel' ? (
              <ParallelFields step={draft} onChange={setDraft} ctx={ctx} />
            ) : (
              <StepFields step={draft} onChange={setDraft} ctx={ctx} />
            )}
          </div>
          <SheetFooter className="border-t bg-muted/20 p-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" data-testid="step-done">
              {t('ops.wfb.done')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
