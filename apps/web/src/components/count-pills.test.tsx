import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CountPills } from './count-pills';

const pills = [
  { value: '', label: 'All', count: 9 },
  { value: 'a', label: 'Alpha', count: 4 },
  { value: 'b', label: 'Beta', count: undefined },
];

describe('CountPills', () => {
  it('shows each label with its count, and marks the selected one', () => {
    render(<CountPills label="State" pills={pills} value="a" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Alpha\s*4/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /All\s*9/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });

  it('reports the chosen value (empty string for "all")', () => {
    const onChange = vi.fn();
    render(<CountPills label="State" pills={pills} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['', 'b']);
  });
});
