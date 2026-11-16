'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type SetLabel = (path: string, label: string | null) => void;

/**
 * Labels and the setter live in separate contexts: the setter is stable, so pages that register a label
 * neither re-render when labels change nor re-run their effect (which would remove and re-add the label in
 * an endless update loop that freezes navigation).
 */
const LabelsContext = createContext<Record<string, string>>({});
const SetLabelContext = createContext<SetLabel | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const setLabel = useCallback<SetLabel>(
    (path, label) =>
      setLabels((prev) => {
        if (label === null) {
          if (!(path in prev)) return prev;
          const next = { ...prev };
          delete next[path];
          return next;
        }
        return prev[path] === label ? prev : { ...prev, [path]: label };
      }),
    [],
  );
  return (
    <SetLabelContext.Provider value={setLabel}>
      <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>
    </SetLabelContext.Provider>
  );
}

export function useBreadcrumbLabels(): Record<string, string> {
  return useContext(LabelsContext);
}

/** Give a dynamic path segment (e.g. /users/:id) a friendly breadcrumb label such as the user's email. */
export function useBreadcrumbLabel(path: string, label: string | null | undefined): void {
  const setLabel = useContext(SetLabelContext);
  useEffect(() => {
    if (!setLabel || !label) return;
    setLabel(path, label);
    return () => setLabel(path, null);
  }, [path, label, setLabel]);
}
