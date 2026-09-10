import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LookupSelect } from './select';

const OPTIONS = [
  { code: 'a', label: 'Alpha' },
  { code: 'b', label: 'Beta' },
];

describe('LookupSelect', () => {
  it('renders the placeholder + one option per code and reports the picked code', () => {
    const onChange = vi.fn();
    render(<LookupSelect options={OPTIONS} value="" onChange={onChange} placeholder="Pick one" />);
    expect(screen.getByRole('option', { name: 'Pick one' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows a loading label and disables while loading', () => {
    render(
      <LookupSelect options={[]} value="" onChange={vi.fn()} loading loadingLabel="Loading…" />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Loading…' })).toBeInTheDocument();
  });

  it('renders an error state with a retry action instead of the select', () => {
    const onRetry = vi.fn();
    render(
      <LookupSelect
        options={[]}
        value=""
        onChange={vi.fn()}
        error
        onRetry={onRetry}
        errorLabel="Boom"
        retryLabel="Retry"
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
