import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../api-fetch';

import { useLookupValues } from './use-lookup-values';

vi.mock('../api-fetch', () => ({ apiFetch: vi.fn().mockResolvedValue({ values: [] }) }));

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useLookupValues', () => {
  it('encodes the type code into the request path (not interpolated raw)', async () => {
    const { result } = renderHook(() => useLookupValues('vehicle/category status'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiFetch).toHaveBeenCalledWith(
      '/reference-data/types/vehicle%2Fcategory%20status/values',
      expect.anything(),
    );
  });
});
