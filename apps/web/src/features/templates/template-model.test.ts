import { describe, expect, it } from 'vitest';

import { localeTabs, referencedVars, templatePath, undeclaredVars } from './template-model';

describe('template-model', () => {
  it('finds the root of every placeholder', () => {
    expect(
      referencedVars('Hi {{ name }}', 'Ref {{reservation.reference}} and {{name}}').sort(),
    ).toEqual(['name', 'reservation']);
  });

  it('reports placeholders that are not declared', () => {
    expect(undeclaredVars('{{a}}', '{{b.c}}', [{ name: 'a' }])).toEqual(['b']);
    expect(undeclaredVars('plain', 'text', [])).toEqual([]);
  });

  it('adds a tab for an active language that has no row yet', () => {
    const tabs = localeTabs([{ localeCode: 'en', hasDraft: true }], ['en', 'fr']);
    expect(tabs).toEqual([
      { code: 'en', hasDraft: true, started: true },
      { code: 'fr', hasDraft: false, started: false },
    ]);
  });

  it('builds the page path', () => {
    expect(templatePath('booking.confirmed', 'email', 'fr')).toBe(
      '/config/templates/booking.confirmed/email?locale=fr',
    );
  });
});
