import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { activeFilterCount, useSearchState } from './use-search-state';

const at = (url: string) =>
  renderHook(() => useSearchState(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
  });

describe('useSearchState', () => {
  it('reads state from the URL with safe defaults', () => {
    const { result } = at('/search?q=abc&kind=rental&page=3&pageSize=50');
    expect(result.current.state).toMatchObject({ q: 'abc', kind: 'rental', page: 3, pageSize: 50 });
    const bad = at('/search?kind=bogus&page=-2&pageSize=7').result.current.state;
    expect(bad).toMatchObject({ kind: '', page: 1, pageSize: 25 });
  });

  it('returns to page 1 when anything but the page changes', () => {
    const { result } = at('/search?q=abc&page=4');
    act(() => result.current.update({ kind: 'reservation' }));
    expect(result.current.state).toMatchObject({ kind: 'reservation', page: 1 });
  });

  it('keeps the page when the page itself changes', () => {
    const { result } = at('/search?q=abc');
    act(() => result.current.update({ page: 3 }));
    expect(result.current.state.page).toBe(3);
  });

  it('drops empty and default values from the URL', () => {
    const { result } = at('/search?q=abc&status=active&pageSize=50');
    act(() => result.current.update({ status: '', pageSize: 25 }));
    expect(result.current.state).toMatchObject({ status: '', pageSize: 25 });
  });

  it('reset clears everything', () => {
    const { result } = at('/search?q=abc&status=active&page=2');
    act(() => result.current.reset());
    expect(result.current.state).toMatchObject({ q: '', status: '', page: 1 });
  });
});

describe('activeFilterCount', () => {
  it('counts only the filters behind the panel', () => {
    const { result } = at('/search?q=abc&kind=rental&status=active&from=2026-01-01');
    expect(activeFilterCount(result.current.state)).toBe(2);
  });
});
