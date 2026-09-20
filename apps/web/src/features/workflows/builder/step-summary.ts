import type { Actors } from '@carrental/contracts';

import { selectorLabel, type EditorStep } from './model';
import { describeRule } from './rule';

type T = (key: string, params?: Record<string, string | number>) => string;
type Names = Parameters<typeof selectorLabel>[1];

const who = (actors: Actors, names: Names) =>
  actors.selectors.map((s) => selectorLabel(s, names)).join(', ');

/** The one or two lines a step card shows: who is asked, how, and by when — or where it branches. */
export function stepSummary(
  step: EditorStep,
  names: Names,
  t: T,
  nameOfStep: (id: string) => string,
): string[] {
  const lines: string[] = [];
  switch (step.type) {
    case 'approval':
    case 'task': {
      lines.push(`${t('ops.wfb.asks')}: ${who(step.actors, names) || t('ops.wfb.nobody')}`);
      const bits = [t(`ops.wfb.mode.${step.actors.mode}`)];
      if (step.actors.mode === 'quorum')
        bits[0] = t('ops.wfb.quorumShort', { n: step.actors.quorum ?? 1 });
      if (step.actors.excludeInitiator) bits.push(t('ops.wfb.notRequester'));
      if (step.due)
        bits.push(
          t(step.due.businessHours ? 'ops.wfb.withinBusinessHours' : 'ops.wfb.withinHours', {
            n: step.due.hours,
          }),
        );
      lines.push(bits.join(' · '));
      break;
    }
    case 'auto':
      lines.push(
        `${t('ops.wfb.tells')}: ${(step.notify ?? []).map((s) => selectorLabel(s, names)).join(', ') || '—'}`,
      );
      break;
    case 'wait':
      lines.push(
        t(step.businessHours ? 'ops.wfb.waitsBusiness' : 'ops.wfb.waits', { n: step.hours }),
      );
      break;
    case 'condition': {
      const to = (id: string | null | undefined) =>
        id === undefined
          ? t('ops.wfb.thenNext')
          : id === null
            ? t('ops.wfb.thenEnd')
            : nameOfStep(id);
      for (const b of step.branches)
        lines.push(`${t('ops.wfb.if')} ${describeRule(b.when) || '…'} → ${to(b.next)}`);
      lines.push(`${t('ops.wfb.otherwise')} → ${to(step.else)}`);
      break;
    }
    case 'parallel':
      lines.push(
        t('ops.wfb.parallelSummary', {
          n: step.branches.length,
          join: t(`ops.wfb.join.${step.join}`),
        }),
      );
      for (const [i, b] of step.branches.entries())
        lines.push(`${i + 1}. ${b.map((s) => s.name).join(' → ')}`);
      break;
  }
  return lines;
}
