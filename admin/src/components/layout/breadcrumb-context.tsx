'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface BreadcrumbOverrides {
  labels: Record<string, string>;
  setLabel: (path: string, label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbOverrides | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const value = useMemo<BreadcrumbOverrides>(
    () => ({
      labels,
      setLabel: (path, label) =>
        setLabels((prev) => {
          if (label === null) {
            if (!(path in prev)) return prev;
            const next = { ...prev };
            delete next[path];
            return next;
          }
          return prev[path] === label ? prev : { ...prev, [path]: label };
        }),
    }),
    [labels],
  );
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbLabels(): Record<string, string> {
  return useContext(BreadcrumbContext)?.labels ?? {};
}

/** Give a dynamic path segment (e.g. /users/:id) a friendly breadcrumb label such as the user's email. */
export function useBreadcrumbLabel(path: string, label: string | null | undefined): void {
  const setLabel = useContext(BreadcrumbContext)?.setLabel;
  useEffect(() => {
    if (!setLabel || !label) return;
    setLabel(path, label);
    return () => setLabel(path, null);
  }, [path, label, setLabel]);
}
