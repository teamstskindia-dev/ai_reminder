/**
 * Full page load to an internal path. Used deliberately for sign-in / sign-out transitions so all
 * in-memory client state (query cache, sockets, preserved route Activity) is dropped.
 */
export function hardNavigate(path: string) {
  window.location.assign(new URL(path, window.location.origin).href);
}
