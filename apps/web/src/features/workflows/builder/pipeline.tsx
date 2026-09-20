import { useI18n } from '@carrental/i18n/react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from 'lucide-react';

import { ruleWords } from '../variables';

import type { EditorDoc, EditorStep, selectorLabel } from './model';
import { stepSummary } from './step-summary';

import { ChoiceTabs } from '@/components/choice-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Names = Parameters<typeof selectorLabel>[1];

function StepCard({
  step,
  index,
  total,
  names,
  problems,
  nameOfStep,
  onEdit,
  onDelete,
  onMove,
}: {
  step: EditorStep;
  index: number;
  total: number;
  names: Names;
  problems: string[];
  nameOfStep: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (to: number) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const words = ruleWords(i18n);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-xl border bg-card p-3 shadow-sm sm:p-4',
        isDragging && 'z-10 opacity-80 shadow-lg',
        problems.length && 'border-destructive/60',
      )}
      data-testid={`step-${step.id}`}
    >
      <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap sm:gap-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="mt-0.5 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={t('ops.wfb.dragStep', { name: step.name, n: index + 1, total })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 basis-40 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <h3 className="font-semibold">{step.name || step.id}</h3>
            <Badge variant="outline">{t(`ops.wf.stepType.${step.type}`)}</Badge>
            {problems.length ? (
              <Badge variant="destructive">{t('ops.wfb.problems', { n: problems.length })}</Badge>
            ) : null}
          </div>
          {stepSummary(step, names, t, nameOfStep, words).map((line, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
          {problems.map((p, i) => (
            <p key={i} className="text-sm text-destructive">
              {p}
            </p>
          ))}
        </div>
        <div className="ms-auto flex shrink-0 flex-wrap justify-end gap-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={index === 0}
            aria-label={t('ops.wfb.moveUp', { name: step.name })}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={index === total - 1}
            aria-label={t('ops.wfb.moveDown', { name: step.name })}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('ops.wfb.editStep', { name: step.name })}
            onClick={onEdit}
            data-testid={`edit-${step.id}`}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('ops.wfb.deleteStepNamed', { name: step.name })}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * The pipeline as an ordered list of step cards. Reorder by dragging the handle — or with the keyboard
 * (focus the handle, Space to lift, arrows to move, Space to drop) — or with the up/down buttons,
 * which are there for people who cannot drag. Where a step goes next follows the order unless a step
 * says otherwise, so reordering never leaves a dangling pointer.
 */
export function Pipeline({
  doc,
  names,
  problemsByStep,
  onMove,
  onEdit,
  onDelete,
  onAdd,
  addTypes,
}: {
  doc: EditorDoc;
  names: Names;
  problemsByStep: Record<string, string[]>;
  onMove: (from: number, to: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (type: string) => void;
  addTypes: string[];
}) {
  const { t } = useI18n();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = doc.steps.map((s) => s.id);
  const nameOfStep = (id: string) => doc.steps.find((s) => s.id === id)?.name ?? id;
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  return (
    <div className="space-y-3">
      {doc.steps.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-6 text-center"
          data-testid="pipeline-empty"
        >
          <p className="font-medium">{t('ops.wfb.directTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('ops.wfb.directBody')}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3" data-testid="pipeline">
              {doc.steps.map((s, i) => (
                <StepCard
                  key={s.id}
                  step={s}
                  index={i}
                  total={doc.steps.length}
                  names={names}
                  nameOfStep={nameOfStep}
                  problems={problemsByStep[s.id] ?? []}
                  onEdit={() => onEdit(s.id)}
                  onDelete={() => onDelete(s.id)}
                  onMove={(to) => onMove(i, to)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t('ops.wfb.addStep')}</p>
        <ChoiceTabs
          value=""
          onChange={onAdd}
          label={t('ops.wfb.addStep')}
          testIdPrefix="add-step"
          options={addTypes.map((ty) => ({ value: ty, label: `+ ${t(`ops.wf.stepType.${ty}`)}` }))}
        />
      </div>
    </div>
  );
}
