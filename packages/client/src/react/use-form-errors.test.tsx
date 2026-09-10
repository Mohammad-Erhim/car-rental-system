import { I18nProvider } from '@carrental/i18n/react';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../api-error';

import { useFormErrors } from './use-form-errors';

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initialLocale="en">{children}</I18nProvider>
);

describe('useFormErrors', () => {
  it('surfaces client-side issues via setLocal and clears them on fromError / clear', () => {
    const { result } = renderHook(() => useFormErrors({ name: 'Name' }), { wrapper });

    act(() => result.current.setLocal([{ path: 'name', code: 'required' }]));
    expect(result.current.summary).toHaveLength(1);
    expect(result.current.fieldError('name')).toBeTruthy();

    // an API error replaces the local set
    act(() =>
      result.current.fromError(
        new ApiError({
          title: 'nope',
          status: 422,
          code: 'validation_failed',
          category: 'validation',
          correlationId: 'test',
          fieldErrors: [{ path: 'other', code: 'required' }],
        }),
      ),
    );
    expect(result.current.fieldError('name')).toBeNull();
    expect(result.current.fieldError('other')).toBeTruthy();

    act(() => result.current.clear());
    expect(result.current.summary).toHaveLength(0);
  });
});
