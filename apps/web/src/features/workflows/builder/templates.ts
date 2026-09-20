import type { ActorSelector } from '@carrental/contracts';

import { insertStep, newStep, type EditorDoc, type EditorStep } from './model';

export type TemplateId =
  | 'blank'
  | 'twoPerson'
  | 'managerThenFinance'
  | 'anyOfRoles'
  | 'everyoneAgrees'
  | 'timedEscalation';

export const TEMPLATE_IDS: TemplateId[] = [
  'blank',
  'twoPerson',
  'managerThenFinance',
  'anyOfRoles',
  'everyoneAgrees',
  'timedEscalation',
];

const role = (roleCode: string): ActorSelector => ({ kind: 'role', roleCode });

const base = (fallback: ActorSelector[] = [role('administrator')]): EditorDoc => ({
  steps: [],
  fallbackActors: fallback,
  maxRevisions: 3,
});

const approval = (
  doc: EditorDoc,
  name: string,
  selectors: ActorSelector[],
  mode: 'any' | 'all' = 'any',
  extra: Record<string, unknown> = {},
  excludeInitiator = false,
): EditorStep => {
  const s = newStep(doc, 'approval', name);
  if (s.type !== 'approval') return s;
  return {
    ...s,
    actors: { ...s.actors, selectors, mode, excludeInitiator },
    ...extra,
  } as EditorStep;
};

/** Starting points for a new workflow. Role codes are the built-in ones; the validator flags a missing one. */
export function templateDoc(id: TemplateId): EditorDoc {
  let doc = base();
  const add = (s: EditorStep) => {
    doc = insertStep(doc, s);
  };
  switch (id) {
    case 'blank':
      break;
    case 'twoPerson':
      add(approval(doc, 'Second-person review', [role('manager')], 'any', {}, true));
      break;
    case 'managerThenFinance':
      add(approval(doc, 'Manager approval', [role('manager')]));
      add(approval(doc, 'Finance approval', [role('finance_staff')]));
      break;
    case 'anyOfRoles':
      add(approval(doc, 'Any of these can approve', [role('manager'), role('finance_staff')]));
      break;
    case 'everyoneAgrees':
      add(approval(doc, 'Everyone must agree', [role('manager'), role('finance_staff')], 'all'));
      break;
    case 'timedEscalation':
      add(
        approval(doc, 'Manager approval', [role('manager')], 'any', {
          due: {
            hours: 24,
            reminderEveryHours: 8,
            maxReminders: 2,
            onTimeout: 'escalate',
            escalateTo: [role('administrator')],
          },
        }),
      );
      break;
  }
  return doc;
}
