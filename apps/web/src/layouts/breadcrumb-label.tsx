import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface Ctx {
  label: string | null;
  setLabel: (label: string | null) => void;
}
const BreadcrumbLabelContext = createContext<Ctx>({ label: null, setLabel: () => {} });

/** Lets a page replace the last breadcrumb (e.g. a record id) with something readable. */
export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return (
    <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>
  );
}

/** The label a page has set for the last breadcrumb, if any. */
export function useCurrentBreadcrumbLabel(): string | null {
  return useContext(BreadcrumbLabelContext).label;
}

/** Call from a detail page: `useBreadcrumbLabel(customer?.fullName)`. Cleared on unmount. */
export function useBreadcrumbLabel(label: string | null | undefined) {
  const { setLabel } = useContext(BreadcrumbLabelContext);
  useEffect(() => {
    setLabel(label ?? null);
    return () => setLabel(null);
  }, [label, setLabel]);
}

/** Declarative form of {@link useBreadcrumbLabel}, for use before early returns. */
export function BreadcrumbLabelSetter({ label }: { label: string | null | undefined }) {
  useBreadcrumbLabel(label);
  return null;
}
