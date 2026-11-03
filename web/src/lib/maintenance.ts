/** Tiny external store: flips to `true` when any API call returns `MAINTENANCE` (503). */
let active = false;
const listeners = new Set<() => void>();

export const maintenanceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => active,
  getServerSnapshot: () => false,
  set(value: boolean) {
    if (active === value) return;
    active = value;
    listeners.forEach((l) => l());
  },
};
