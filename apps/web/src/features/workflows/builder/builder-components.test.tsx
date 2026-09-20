import type { ActorSelector } from '@carrental/contracts';
import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActorsEditor } from './actors-editor';
import { ImportExport } from './import-export';
import { insertStep, newStep, toSpec, type EditorDoc } from './model';
import { Pipeline } from './pipeline';
import { RuleBuilder } from './rule-builder';

import type { WorkflowOptions } from '@/lib/workflow-hooks';

const wrap = (ui: React.ReactNode) => render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);

const options: WorkflowOptions = {
  roles: [
    { code: 'manager', name: 'Location manager', isSystem: true },
    { code: 'finance_staff', name: 'Finance', isSystem: true },
  ],
  groups: [{ id: 'g1', code: 'fleet_desk', name: 'Fleet desk' }],
  people: [{ staffProfileId: 'p1', name: 'Ana Perez', email: 'ana@example.test' }],
};

describe('ActorsEditor', () => {
  it('adds and removes roles with toggles, and shows who is chosen', () => {
    const onChange = vi.fn();
    wrap(<ActorsEditor value={[]} onChange={onChange} options={options} label="Who approves" />);
    expect(screen.getByText(/nobody chosen yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('actor-role-manager'));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'role', roleCode: 'manager' }]);
  });

  it('removes a chosen actor from its chip', () => {
    const onChange = vi.fn();
    const value: ActorSelector[] = [{ kind: 'role', roleCode: 'manager' }];
    wrap(<ActorsEditor value={value} onChange={onChange} options={options} label="Who approves" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Location manager' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('switches to people and filters them by name', () => {
    const onChange = vi.fn();
    wrap(<ActorsEditor value={[]} onChange={onChange} options={options} label="Who approves" />);
    fireEvent.click(screen.getByRole('radio', { name: 'People' }));
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByText('Ana Perez'));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'user', staffProfileId: 'p1' }]);
  });

  it('offers the requester as a dynamic actor', () => {
    const onChange = vi.fn();
    wrap(<ActorsEditor value={[]} onChange={onChange} options={options} label="Who approves" />);
    fireEvent.click(screen.getByRole('radio', { name: 'The requester / owner' }));
    fireEvent.click(screen.getByText('The requester'));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'dynamic', source: 'initiator' }]);
  });
});

describe('RuleBuilder', () => {
  it('builds a JSON-logic rule from tabs and a value', () => {
    const onChange = vi.fn();
    wrap(
      <RuleBuilder
        value={{}}
        onChange={onChange}
        variables={['amount', 'location']}
        label="When"
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'more than' }));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '500' } });
    expect(onChange).toHaveBeenLastCalledWith({ '>': [{ var: 'amount' }, 500] });
  });

  it('shows a rule it cannot express as read-only JSON instead of rewriting it', () => {
    wrap(
      <RuleBuilder
        value={{ if: [1, 2, 3] }}
        onChange={() => undefined}
        variables={['amount']}
        label="When"
      />,
    );
    expect(screen.getByTestId('rule-custom')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-builder')).toBeNull();
  });
});

describe('Pipeline', () => {
  const names = {
    role: (c: string) => c,
    user: () => 'u',
    group: () => 'g',
    dynamic: (s: string) => s,
  };
  const build = (): EditorDoc => {
    let doc: EditorDoc = {
      steps: [],
      fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
      maxRevisions: 3,
    };
    for (const n of ['First', 'Second']) doc = insertStep(doc, newStep(doc, 'approval', n));
    return doc;
  };

  it('renders each step with who it asks, and move / edit / delete controls', () => {
    const doc = build();
    const onMove = vi.fn();
    const onEdit = vi.fn();
    wrap(
      <Pipeline
        doc={doc}
        names={names}
        problemsByStep={{}}
        onMove={onMove}
        onEdit={onEdit}
        onDelete={() => undefined}
        onAdd={() => undefined}
        addTypes={['approval']}
      />,
    );
    expect(screen.getAllByText(/Asks: manager/)).toHaveLength(2);
    // the first step cannot move up, the last cannot move down
    expect(screen.getByRole('button', { name: 'Move “First” up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move “First” down' }));
    expect(onMove).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Second”' }));
    expect(onEdit).toHaveBeenCalledWith(doc.steps[1]!.id);
  });

  it('marks a step that has problems', () => {
    const doc = build();
    wrap(
      <Pipeline
        doc={doc}
        names={names}
        problemsByStep={{ [doc.steps[0]!.id]: ['Nobody can act'] }}
        onMove={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
        onAdd={() => undefined}
        addTypes={[]}
      />,
    );
    expect(screen.getByText('Nobody can act')).toBeInTheDocument();
    expect(screen.getByText('1 problem(s)')).toBeInTheDocument();
  });

  it('an empty pipeline says the change is applied directly', () => {
    wrap(
      <Pipeline
        doc={{ steps: [], fallbackActors: [], maxRevisions: 3 }}
        names={names}
        problemsByStep={{}}
        onMove={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
        onAdd={() => undefined}
        addTypes={[]}
      />,
    );
    expect(screen.getByTestId('pipeline-empty')).toBeInTheDocument();
  });

  it('adds a step of the chosen type', () => {
    const onAdd = vi.fn();
    wrap(
      <Pipeline
        doc={build()}
        names={names}
        problemsByStep={{}}
        onMove={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
        onAdd={onAdd}
        addTypes={['approval', 'wait']}
      />,
    );
    fireEvent.click(screen.getByTestId('add-step-wait'));
    expect(onAdd).toHaveBeenCalledWith('wait');
  });
});

describe('ImportExport', () => {
  const spec = toSpec({
    steps: [],
    fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
    maxRevisions: 3,
  });

  it('refuses text that is not JSON, and a definition that is not valid', async () => {
    const onLoad = vi.fn();
    wrap(<ImportExport name="x" code="x" spec={spec} canEdit onLoad={onLoad} />);
    fireEvent.change(screen.getByTestId('import-text'), { target: { value: 'not json' } });
    fireEvent.click(screen.getByTestId('import-load'));
    expect(await screen.findByText('That is not valid JSON.')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('import-text'), {
      target: {
        value: JSON.stringify({
          start: 'nope',
          steps: {},
          fallbackActors: [{ kind: 'role', roleCode: 'a' }],
        }),
      },
    });
    fireEvent.click(screen.getByTestId('import-load'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('loads a valid definition — bare or wrapped as exported — whole', () => {
    const onLoad = vi.fn();
    wrap(<ImportExport name="x" code="x" spec={spec} canEdit onLoad={onLoad} />);
    fireEvent.change(screen.getByTestId('import-text'), {
      target: { value: JSON.stringify({ name: 'x', code: 'x', spec }) },
    });
    fireEvent.click(screen.getByTestId('import-load'));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('read-only viewers can export but not import', () => {
    wrap(<ImportExport name="x" code="x" spec={spec} canEdit={false} onLoad={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeInTheDocument();
    expect(screen.queryByTestId('import-text')).toBeNull();
  });
});
