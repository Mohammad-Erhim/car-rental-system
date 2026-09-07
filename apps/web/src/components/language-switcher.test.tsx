import { I18nProvider, useI18n } from '@carrental/i18n/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LanguageSwitcher } from './language-switcher.js';

function wrap(ui: React.ReactNode, locale = 'en') {
  return render(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>);
}

function DirProbe() {
  const { setLocale, direction } = useI18n();
  return (
    <div>
      <span data-testid="dir">{direction}</span>
      <button onClick={() => setLocale('ar')}>to-ar</button>
      <button onClick={() => setLocale('en')}>to-en</button>
    </div>
  );
}

describe('LanguageSwitcher (EL-SH-001)', () => {
  it('names the current language (not flag-only)', () => {
    wrap(<LanguageSwitcher />, 'fr');
    expect(
      screen.getByRole('button', { name: /Langue actuelle|Current language/ }),
    ).toHaveTextContent('Français');
  });

  it('switching locale to an RTL language flips document direction', () => {
    wrap(<DirProbe />, 'en');
    expect(screen.getByTestId('dir')).toHaveTextContent('ltr');
    fireEvent.click(screen.getByRole('button', { name: 'to-ar' }));
    expect(screen.getByTestId('dir')).toHaveTextContent('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }));
    expect(document.documentElement.dir).toBe('ltr');
  });
});
