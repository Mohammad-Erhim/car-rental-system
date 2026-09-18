import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
}
const columns: ColumnDef<Row, unknown>[] = [
  { id: 'name', header: 'Name', cell: ({ row }) => row.original.name },
];
const data: Row[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
];

function setup(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable<Row>
      label="People"
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      {...props}
    />,
  );
}

describe('DataTable', () => {
  it('renders a header and a row per record', () => {
    setup();
    const table = screen.getByRole('table', { name: 'People' });
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2
  });

  it('shows skeleton rows, not data, while loading', () => {
    setup({ loading: true, skeletonRows: 3 });
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByRole('table')).toHaveAttribute('aria-label', 'People');
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 skeletons
  });

  it('dims but keeps the rows while refetching', () => {
    setup({ fetching: true });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('shows the empty node when there are no rows', () => {
    setup({ data: [], empty: <p>Nothing found</p> });
    expect(screen.getByText('Nothing found')).toBeInTheDocument();
  });

  it('shows the error node instead of rows', () => {
    setup({ error: <p>Broke</p> });
    expect(screen.getByText('Broke')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('reports a row click with the record', () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    fireEvent.click(screen.getByText('Beta'));
    expect(onRowClick).toHaveBeenCalledWith({ id: '2', name: 'Beta' });
  });

  it('renders the card list alongside the table when a card layout is given', () => {
    setup({ renderCard: (r) => <span>card:{r.name}</span> });
    expect(screen.getByText('card:Alpha')).toBeInTheDocument();
  });
});
