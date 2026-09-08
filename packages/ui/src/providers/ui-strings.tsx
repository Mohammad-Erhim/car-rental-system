import { createContext, useContext, type ReactNode } from 'react';

/**
 * A handful of micro-copy strings the shared components render themselves (e.g. the "(optional)"
 * suffix on {@link Field}). `packages/ui` stays framework-agnostic — it never imports an i18n
 * runtime — so an i18n-aware app feeds the translated strings in once via {@link UiStringsProvider}
 * and every component picks them up. Without a provider the English defaults apply, which keeps
 * `packages/ui` usable in isolation (Storybook, tests, a non-localised host).
 */
export interface UiStrings {
  /** shown after the label of a non-required field */
  optional: string;
}

export const DEFAULT_UI_STRINGS: UiStrings = {
  optional: 'optional',
};

const UiStringsContext = createContext<UiStrings>(DEFAULT_UI_STRINGS);

export function UiStringsProvider({
  value,
  children,
}: {
  value: Partial<UiStrings>;
  children: ReactNode;
}) {
  return (
    <UiStringsContext.Provider value={{ ...DEFAULT_UI_STRINGS, ...value }}>
      {children}
    </UiStringsContext.Provider>
  );
}

export function useUiStrings(): UiStrings {
  return useContext(UiStringsContext);
}
