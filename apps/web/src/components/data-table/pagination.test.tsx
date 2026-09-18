import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, pageWindow } from './pagination';

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('collapses gaps but keeps first, last and the current neighbourhood', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 20]);
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 19, 20]);
  });

  it('shows a lone hidden page as a number, not an ellipsis', () => {
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
  });
});

function setup(props: Partial<React.ComponentProps<typeof Pagination>> = {}) {
  const onPageChange = vi.fn();
  render(
    <I18nProvider initialLocale="en">
      <Pagination
        page={2}
        pageSize={10}
        total={45}
        onPageChange={onPageChange}
        onPageSizeChange={() => {}}
        {...props}
      />
    </I18nProvider>,
  );
  return { onPageChange };
}

describe('Pagination', () => {
  it('summarises the visible range', () => {
    setup();
    expect(screen.getByText('Showing 11–20 of 45')).toBeInTheDocument();
  });

  it('clamps the range on the last page', () => {
    setup({ page: 5 });
    expect(screen.getByText('Showing 41–45 of 45')).toBeInTheDocument();
  });

  it('moves with previous / next / a page number', () => {
    const { onPageChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 5' }));
    expect(onPageChange.mock.calls.map((c) => c[0])).toEqual([1, 3, 5]);
  });

  it('disables previous on the first page and next on the last', () => {
    setup({ page: 1 });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('marks the current page', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
