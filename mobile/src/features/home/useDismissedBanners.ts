import { useCallback, useEffect, useState } from 'react';

import { readJson, StorageKeys, writeJson } from '@/utils/storage';

/** Banner ids the user closed, persisted across launches. */
export function useDismissedBanners() {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    readJson<string[]>(StorageKeys.dismissedBanners).then((ids) => {
      if (!cancelled && ids?.length) setDismissed(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      void writeJson(StorageKeys.dismissedBanners, Array.from(next).slice(-50));
      return next;
    });
  }, []);

  return { dismissed, dismiss };
}
