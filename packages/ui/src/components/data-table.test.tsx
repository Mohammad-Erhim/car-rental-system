import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from './data-table';

interface Row {
  code: string;
  name: string;
  qty: number;
}
const rows: Row[] = [
  { code: 'a', name: 'Alpha', qty: 2 },
  { code: 'b', name: 'Beta', qty: 5 },
];
const columns: Array<DataTableColumn<Row>> = [
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'qty', header: 'Qty', cell: (r) => r.qty, className: 'text-end' },
];
const labels = {
  loading: 'Loading',
  loadFailTitle: "That didn't work",
  retry: 'Retry',
  empty: 'Nothing here',
};

describe('DataTable (STAGE-012 shared ops list)', () => {
  it('renders headers + a row per item, with data-col + row props', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.code}
        labels={labels}
        testid="things"
        rowProps={(r) => ({ 'data-code': r.code })}
      />,
    );
    expect(screen.getByTestId('things')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    const body = screen.getByTestId('things-rows');
    expect(body.querySelectorAll('tr')).toHaveLength(2);
    expect(body.querySelector('tr[data-code="b"]')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(body.querySelector('td[data-col="qty"]')).toHaveClass('text-end');
  });

  it('shows the loading state and no table', () => {
    render(
      <DataTable
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.code}
        labels={labels}
        isLoading
      />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-appstate', 'loading');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the failure state with a retry action', () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.code}
        labels={labels}
        isError
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveAttribute('data-appstate', 'failure');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the empty (no-results) state for a zero-length list', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.code} labels={labels} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a full-width sub-row under rows for which renderSubRow returns a node', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.code}
        labels={labels}
        testid="things"
        renderSubRow={(r) => (r.code === 'b' ? <div>detail for {r.name}</div> : null)}
      />,
    );
    const body = screen.getByTestId('things-rows');
    // 2 data rows + 1 sub-row
    expect(body.querySelectorAll('tr')).toHaveLength(3);
    const sub = body.querySelector('tr[data-subrow]');
    expect(sub).toBeInTheDocument();
    expect(sub?.querySelector('td')).toHaveAttribute('colspan', '2');
    expect(screen.getByText('detail for Beta')).toBeInTheDocument();
  });

  it('passes rowKey an index for positional data and applies rowClassName to every row', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(_r, i) => `row-${i}`}
        labels={labels}
        testid="things"
        rowClassName="align-top"
      />,
    );
    const dataRows = screen.getByTestId('things-rows').querySelectorAll('tr');
    expect(dataRows).toHaveLength(2);
    dataRows.forEach((tr) => expect(tr).toHaveClass('align-top', 'border-t'));
  });
});
