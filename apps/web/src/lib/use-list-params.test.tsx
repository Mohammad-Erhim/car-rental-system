import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useListParams } from './use-list-params';

function setup(url: string) {
  return renderHook(
    () => {
      const list = useListParams(['state'] as const);
      const loc = useLocation();
      return { ...list, url: loc.pathname + loc.search };
    },
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> },
  );
}

describe('useListParams', () => {
  it('reset clears the page filters but keeps the top-bar location choice', () => {
    const { result } = setup('/reservations?state=confirmed&page=3&location=LHR,JFK');
    act(() => result.current.reset());
    expect(result.current.url).toBe('/reservations?location=LHR%2CJFK');
  });

  it('reset with no location leaves a clean URL', () => {
    const { result } = setup('/reservations?state=confirmed');
    act(() => result.current.reset());
    expect(result.current.url).toBe('/reservations');
  });

  it('changing a filter returns to page 1 and leaves the location alone', () => {
    const { result } = setup('/reservations?page=4&location=JFK');
    act(() => result.current.update({ state: 'active' }));
    expect(result.current.url).toBe('/reservations?location=JFK&state=active');
  });
});
