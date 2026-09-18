import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ValueSheet } from './value-sheet';

const locales = [
  { code: 'en', englishName: 'English' },
  { code: 'fr', englishName: 'French' },
];

const show = (existing: string[] = ['taken']) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="en">
        <ValueSheet
          typeCode="cancel_reason"
          locales={locales}
          existingCodes={existing}
          value={null}
          open
          onOpenChange={() => {}}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe('ValueSheet (create)', () => {
  it('normalises the code as you type', () => {
    show();
    const code = screen.getByTestId('value-code') as HTMLInputElement;
    fireEvent.change(code, { target: { value: 'Some Code-1!' } });
    expect(code.value).toBe('somecode1');
  });

  it('requires an English label', async () => {
    show();
    fireEvent.change(screen.getByTestId('value-code'), { target: { value: 'fresh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This is required')).toBeInTheDocument();
  });

  it('rejects a code that already exists in the list', async () => {
    show();
    fireEvent.change(screen.getByTestId('value-code'), { target: { value: 'taken' } });
    fireEvent.change(screen.getByTestId('label-en'), { target: { value: 'Taken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That code is already used in this list.')).toBeInTheDocument();
  });

  it('offers a label field per active locale, English required', () => {
    show();
    expect(screen.getByTestId('label-en')).toBeInTheDocument();
    expect(screen.getByTestId('label-fr')).toBeInTheDocument();
    expect(
      screen.getByText('Optional — falls back to the English label when left empty.'),
    ).toBeInTheDocument();
  });
});
