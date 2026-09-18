import { render, screen } from '@testing-library/react';
import { Gauge } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { StatCard } from './stat-card';

function setup(props: Partial<React.ComponentProps<typeof StatCard>>) {
  return render(
    <MemoryRouter>
      <StatCard
        label="Overdue"
        value={0}
        to="/rentals"
        icon={Gauge}
        viewLabel="View"
        unavailableLabel="Unavailable"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('StatCard', () => {
  it('links the whole tile to its queue', () => {
    setup({ value: 3 });
    expect(screen.getByTestId('ops-stat-card')).toHaveAttribute('href', '/rentals');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the all-clear label instead of 0 for an alert tile at zero', () => {
    setup({ tone: 'alert', value: 0, zeroLabel: 'No overdue' });
    expect(screen.getByText('No overdue')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('marks a non-zero alert tile as alerting', () => {
    setup({ tone: 'alert', value: 2 });
    expect(screen.getByText('2')).toHaveClass('text-destructive');
  });

  it('shows "unavailable", never a number, when the metric could not be read', () => {
    setup({ value: 0, unavailable: true });
    expect(screen.getByTestId('metric-unavailable')).toHaveTextContent('Unavailable');
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders a skeleton, not a value, while loading', () => {
    setup({ value: 9, loading: true });
    expect(screen.queryByText('9')).toBeNull();
    expect(screen.queryByTestId('metric-unavailable')).toBeNull();
  });
});
