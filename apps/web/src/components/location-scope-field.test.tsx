import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import {
  LocationScopeField,
  scopeIssue,
  scopeModeOf,
  type ScopeMode,
} from './location-scope-field';

import { Form } from '@/components/ui/form';

interface V {
  scope: string[];
  mode: ScopeMode;
}

let latest: V = { scope: [], mode: 'all' };
function Harness({ initial, restricted = false }: { initial: V; restricted?: boolean }) {
  const form = useForm<V>({ defaultValues: initial });
  latest = form.watch();
  return (
    <I18nProvider initialLocale="en">
      <Form {...form}>
        <LocationScopeField
          control={form.control}
          name="scope"
          modeName="mode"
          label="Locations"
          restricted={restricted}
          allLabel="All locations"
          allHint="everywhere"
          specificLabel="Specific"
          options={[
            { value: 'LHR', label: 'Heathrow' },
            { value: 'OLD', label: 'Old', archived: true },
          ]}
        />
      </Form>
    </I18nProvider>
  );
}

describe('scope helpers', () => {
  it('an empty list is "all", anything else is "specific"', () => {
    expect(scopeModeOf([])).toBe('all');
    expect(scopeModeOf(['LHR'])).toBe('specific');
  });
  it('"specific" with nothing chosen is the invalid state (never a silent "all")', () => {
    expect(scopeIssue('specific', [])).toBe(true);
    expect(scopeIssue('specific', ['LHR'])).toBe(false);
    expect(scopeIssue('all', [])).toBe(false);
  });
});

describe('LocationScopeField', () => {
  it('"all" shows no checklist; "specific" reveals it, and going back to "all" clears the choice', async () => {
    render(<Harness initial={{ scope: [], mode: 'all' }} />);
    expect(screen.queryByText('Heathrow')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Specific/));
    expect(await screen.findByText('Heathrow')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Heathrow'));
    await waitFor(() => expect(latest.scope).toEqual(['LHR']));
    fireEvent.click(screen.getByLabelText(/All locations/));
    await waitFor(() => expect(latest.scope).toEqual([]));
    expect(latest.mode).toBe('all');
  });

  it('flags an archived branch that is already in the scope so it can be removed', () => {
    render(<Harness initial={{ scope: ['OLD'], mode: 'specific' }} />);
    expect(screen.getByText('archived')).toBeInTheDocument();
  });

  it('a restricted account cannot pick "all locations"', () => {
    render(<Harness initial={{ scope: ['LHR'], mode: 'specific' }} restricted />);
    expect(screen.getByLabelText(/All locations/)).toBeDisabled();
    expect(screen.getByLabelText('Heathrow')).toBeInTheDocument();
  });
});
